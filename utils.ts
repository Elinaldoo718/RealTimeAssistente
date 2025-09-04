/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Blob} from '@google/genai';

function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  // Extract interleaved channels
  if (numChannels === 0) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i,
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}

// Função para buscar informações na web usando DuckDuckGo
async function searchWeb(query: string): Promise<string> {
  try {
    // Codificar a query para URL
    const encodedQuery = encodeURIComponent(query);
    
    // Fazer a requisição para a API do DuckDuckGo
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extrair informações relevantes dos resultados
    let result = '';
    
    // Adicionar o título do resultado principal se existir
    if (data.Heading) {
      result += `Título: ${data.Heading}\n\n`;
    }
    
    // Adicionar o resumo do resultado principal se existir
    if (data.AbstractText) {
      result += `Resumo: ${data.AbstractText}\n\n`;
    }
    
    // Adicionar os resultados relacionados se existirem
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      result += 'Resultados relacionados:\n';
      // Limitar a 5 resultados para não sobrecarregar
      const topics = data.RelatedTopics.slice(0, 5);
      for (const topic of topics) {
        if (topic.Text) {
          result += `- ${topic.Text}\n`;
        }
      }
    }
    
    // Se não houver resultados, retornar uma mensagem apropriada
    if (!result) {
      result = 'Nenhuma informação encontrada para a consulta.';
    }
    
    return result;
  } catch (error) {
    console.error('Erro ao buscar informações na web:', error);
    return `Desculpe, não foi possível buscar informações na web. Erro: ${error.message}`;
  }
}

export {createBlob, decode, decodeAudioData, encode, searchWeb};