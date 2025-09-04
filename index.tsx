/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData, searchWeb} from './utils';
import './visual-3d';

interface ChatMessage {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() isSessionReady = false;
  @state() apiKey = '';
  @state() chatMessages: ChatMessage[] = [];
  @state() isChatVisible = false;
  @state() isSearching = false;
  @state() isTeachingMode = false;
  @state() selectedLanguage = 'en'; // Idioma padrão: Inglês

  private client: GoogleGenAI;
  private session: Session;
  // FIX: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'. Cast to `any` to allow for prefixed version in older browsers.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  // FIX: Property 'webkitAudioContext' does not exist on type 'Window & typeof globalThis'. Cast to `any` to allow for prefixed version in older browsers.
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();
  private messageIdCounter = 0;

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }

    .api-key-container {
      position: absolute;
      top: 20px;
      left: 20px;
      z-index: 10;
      background: rgba(0, 0, 0, 0.7);
      padding: 15px;
      border-radius: 10px;
      color: white;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 300px;
    }

    .api-key-input {
      padding: 8px;
      border-radius: 5px;
      border: 1px solid #ccc;
      background: rgba(255, 255, 255, 0.9);
    }

    .api-key-button {
      padding: 8px 15px;
      border-radius: 5px;
      border: none;
      background: #4285f4;
      color: white;
      cursor: pointer;
      font-weight: bold;

      &:hover {
        background: #3367d6;
      }
    }

    /* Estilos para o modo de ensino */
    .teaching-mode-container {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      background: rgba(0, 0, 0, 0.7);
      padding: 15px;
      border-radius: 10px;
      color: white;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 300px;
      align-items: center;
    }

    .teaching-mode-toggle {
      padding: 8px 15px;
      border-radius: 5px;
      border: none;
      background: #34a853;
      color: white;
      cursor: pointer;
      font-weight: bold;

      &:hover {
        background: #2d9247;
      }
    }

    .teaching-mode-active {
      background: #ea4335;
    }

    .teaching-mode-active:hover {
      background: #d33a2c;
    }

    .language-selector {
      padding: 8px;
      border-radius: 5px;
      border: 1px solid #ccc;
      background: rgba(255, 255, 255, 0.9);
      width: 100%;
    }

    .language-info {
      font-size: 0.9em;
      opacity: 0.8;
      text-align: center;
    }

    /* Estilos para o chat */
    .chat-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 100;
      width: 300px;
      max-height: 70vh;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: translateX(0);
      transition: transform 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .chat-container.hidden {
      transform: translateX(calc(100% + 20px));
    }

    .chat-header {
      padding: 10px 15px;
      background: rgba(66, 133, 244, 0.8);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chat-toggle {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 16px;
      padding: 5px;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .message {
      padding: 8px 12px;
      border-radius: 18px;
      max-width: 80%;
      word-wrap: break-word;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .user-message {
      align-self: flex-end;
      background: #4285f4;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .ai-message {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-bottom-left-radius: 4px;
    }

    .search-message {
      align-self: flex-start;
      background: rgba(255, 165, 0, 0.3);
      color: white;
      border-bottom-left-radius: 4px;
      font-style: italic;
    }

    .teaching-message {
      align-self: flex-start;
      background: rgba(52, 168, 83, 0.3);
      color: white;
      border-bottom-left-radius: 4px;
      font-style: italic;
    }

    .message-time {
      font-size: 0.7em;
      opacity: 0.7;
      margin-top: 4px;
      text-align: right;
    }

    .searching-indicator {
      display: flex;
      align-items: center;
      gap: 5px;
      font-style: italic;
    }

    .spinner {
      width: 12px;
      height: 12px;
      border: 2px solid transparent;
      border-top: 2px solid #4285f4;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  constructor() {
    super();
    // Initialize with API key from environment variable if available
    this.apiKey = process.env.GEMINI_API_KEY || '';
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    if (!this.apiKey) {
      this.updateError('Por favor, insira sua API Key do Gemini');
      return;
    }

    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: this.apiKey,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    this.isSessionReady = false;
    this.updateStatus('Conectando...');
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Pronto');
            this.isSessionReady = true;
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            // Extrair texto da mensagem para exibir no chat
            const textParts = message.serverContent?.modelTurn?.parts || [];
            let textContent = '';
            
            // Verificar se há partes de texto na mensagem
            for (const part of textParts) {
              if ((part as any).text) {
                textContent += (part as any).text + ' ';
              }
            }

            // Só adicionamos a mensagem se houver conteúdo de texto
            if (textContent.trim()) {
              this.addChatMessage(textContent.trim(), false);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Conexão encerrada.');
            this.isSessionReady = false;
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            languageCode: this.selectedLanguage === 'pt' ? 'pt-BR' : 
                         this.selectedLanguage === 'es' ? 'es-ES' : 
                         this.selectedLanguage === 'fr' ? 'fr-FR' : 
                         this.selectedLanguage === 'de' ? 'de-DE' : 
                         this.selectedLanguage === 'it' ? 'it-IT' : 
                         this.selectedLanguage === 'ja' ? 'ja-JP' : 'en-US'
          },
        },
      });
    } catch (e) {
      console.error(e);
      this.updateError(e.message);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = '';
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private setApiKey(e: Event) {
    const input = e.target as HTMLInputElement;
    this.apiKey = input.value;
  }

  private saveApiKey() {
    if (this.apiKey) {
      // Reinitialize client with new API key
      this.initClient();
    } else {
      this.updateError('Por favor, insira uma API Key válida');
    }
  }

  private addChatMessage(text: string, isUser: boolean, isSearchResult: boolean = false) {
    const newMessage: ChatMessage = {
      id: this.messageIdCounter++,
      text: text,
      isUser: isUser,
      timestamp: new Date()
    };
    
    this.chatMessages = [...this.chatMessages, newMessage];
    
    // Rolar para o final das mensagens
    this.updateComplete.then(() => {
      const messagesContainer = this.shadowRoot?.querySelector('.chat-messages');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    });
  }

  private toggleChat() {
    this.isChatVisible = !this.isChatVisible;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Função para buscar informações na web
  private async performWebSearch(query: string) {
    this.isSearching = true;
    this.addChatMessage(`Buscando informações sobre: "${query}"...`, false, true);
    
    try {
      const results = await searchWeb(query);
      this.addChatMessage(`Resultados da busca:\n${results}`, false, true);
    } catch (error) {
      this.addChatMessage(`Erro na busca: ${error.message}`, false, true);
    } finally {
      this.isSearching = false;
    }
  }

  // Funções para o modo de ensino
  private toggleTeachingMode() {
    this.isTeachingMode = !this.isTeachingMode;
    if (this.isTeachingMode) {
      this.addChatMessage(`Modo de ensino ativado! Agora você está estudando ${this.getLanguageName(this.selectedLanguage)}.`, false, false);
      this.addChatMessage("Como posso ajudá-lo com o seu aprendizado de idiomas hoje?", false, false);
    } else {
      this.addChatMessage("Modo de ensino desativado.", false, false);
    }
    // Recriar a sessão para aplicar as configurações de idioma
    this.reset();
  }

  private setSelectedLanguage(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedLanguage = select.value;
    // Se estiver no modo de ensino, recriar a sessão para aplicar o novo idioma
    if (this.isTeachingMode) {
      this.reset();
      this.addChatMessage(`Idioma alterado para ${this.getLanguageName(this.selectedLanguage)}.`, false, false);
    }
  }

  private getLanguageName(code: string): string {
    const languages: {[key: string]: string} = {
      'en': 'Inglês',
      'pt': 'Português',
      'es': 'Espanhol',
      'fr': 'Francês',
      'de': 'Alemão',
      'it': 'Italiano',
      'ja': 'Japonês'
    };
    return languages[code] || 'Inglês';
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Solicitando acesso ao microfone...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Acesso ao microfone concedido. Iniciando captura...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus(this.isTeachingMode ? 
        `🔴 Gravando... Modo ensino (${this.getLanguageName(this.selectedLanguage)})` : 
        '🔴 Gravando... Fale agora.');
    } catch (err) {
      console.error('Erro ao iniciar a gravação:', err);
      this.updateError(`Erro ao iniciar a gravação: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.isSessionReady) {
      this.updateStatus(this.isTeachingMode ? 
        `Pronto - Modo ensino (${this.getLanguageName(this.selectedLanguage)})` : 
        'Pronto');
    }
  }

  private reset() {
    this.session?.close();
    this.initSession();
  }

  render() {
    return html`
      <div>
        <div class="api-key-container">
          <label for="api-key">API Key do Gemini:</label>
          <input
            type="password"
            id="api-key"
            class="api-key-input"
            .value=${this.apiKey}
            @input=${this.setApiKey}
            placeholder="Insira sua API Key do Gemini"
          />
          <button class="api-key-button" @click=${this.saveApiKey}>
            Salvar e Conectar
          </button>
        </div>

        <!-- Modo de ensino -->
        <div class="teaching-mode-container">
          <button 
            class="teaching-mode-toggle ${this.isTeachingMode ? 'teaching-mode-active' : ''}" 
            @click=${this.toggleTeachingMode}>
            ${this.isTeachingMode ? 'Desativar Modo Ensino' : 'Ativar Modo Ensino'}
          </button>
          ${this.isTeachingMode ? html`
            <select class="language-selector" @change=${this.setSelectedLanguage} .value=${this.selectedLanguage}>
              <option value="en">Inglês</option>
              <option value="pt">Português</option>
              <option value="es">Espanhol</option>
              <option value="fr">Francês</option>
              <option value="de">Alemão</option>
              <option value="it">Italiano</option>
              <option value="ja">Japonês</option>
            </select>
            <div class="language-info">
              Idioma selecionado: ${this.getLanguageName(this.selectedLanguage)}
            </div>
          ` : ''}
        </div>

        <!-- Botão flutuante para abrir o chat -->
        <button 
          class="chat-toggle-floating" 
          @click=${this.toggleChat}
          style="
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99;
            background: #4285f4;
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 20px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            display: ${this.isChatVisible ? 'none' : 'flex'};
            align-items: center;
            justify-content: center;
          "
        >
          💬
        </button>

        <!-- Componente de chat -->
        <div class="chat-container ${this.isChatVisible ? '' : 'hidden'}">
          <div class="chat-header">
            <span>Conversa</span>
            <button class="chat-toggle" @click=${this.toggleChat}>
              ✕
            </button>
          </div>
          <div class="chat-messages">
            ${this.chatMessages.map(
              message => html`
                <div class="message ${message.isUser ? 'user-message' : 
                  (message.text.startsWith('Buscando') || message.text.startsWith('Resultados') || message.text.startsWith('Erro na busca')) ? 'search-message' : 
                  (message.text.includes('Modo de ensino') || message.text.includes('Idioma alterado')) ? 'teaching-message' : 'ai-message'}">
                  <div>
                    ${message.text}
                  </div>
                  <div class="message-time">${this.formatTime(message.timestamp)}</div>
                </div>
              `
            )}
            ${this.isSearching ? html`
              <div class="message search-message">
                <div class="searching-indicator">
                  <div class="spinner"></div>
                  <span>Buscando informações...</span>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording || !this.isSessionReady}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div id="status">
          ${this.error ? `Erro: ${this.error}` : this.status}
        </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}