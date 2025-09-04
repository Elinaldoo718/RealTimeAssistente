/**
 * PWA Manager - Handles installation prompts and lifecycle
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstalled = false;
  private installButton: HTMLElement | null = null;
  private installBanner: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.showInstallPromotion();
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.hideInstallPromotion();
      this.showInstalledMessage();
    });

    // Check if app is already installed
    this.checkIfInstalled();
    
    // Register service worker
    this.registerServiceWorker();
  }

  private async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered successfully:', registration);
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.showUpdateAvailable();
              }
            });
          }
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  private checkIfInstalled() {
    // Check if running in standalone mode (installed PWA)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
      return;
    }

    // Check for iOS Safari standalone mode
    if ((window.navigator as any).standalone === true) {
      this.isInstalled = true;
      return;
    }

    // Check for Android Chrome installed app
    if (document.referrer.includes('android-app://')) {
      this.isInstalled = true;
      return;
    }
  }

  private showInstallPromotion() {
    if (this.isInstalled) return;

    // Create install banner
    this.createInstallBanner();
    
    // Show install button if it exists
    if (this.installButton) {
      this.installButton.style.display = 'block';
    }
  }

  private hideInstallPromotion() {
    if (this.installBanner) {
      this.installBanner.remove();
      this.installBanner = null;
    }
    
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  private createInstallBanner() {
    // Don't show banner if already exists or app is installed
    if (this.installBanner || this.isInstalled) return;

    const banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">
          <img src="/icons/icon-72x72.png" alt="Live Audio AI" />
        </div>
        <div class="pwa-banner-text">
          <h3>Instalar Live Audio AI</h3>
          <p>Tenha acesso rápido e offline ao seu assistente de voz com IA</p>
        </div>
        <div class="pwa-banner-actions">
          <button class="pwa-install-btn" id="pwa-install">Instalar</button>
          <button class="pwa-dismiss-btn" id="pwa-dismiss">×</button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .pwa-install-banner {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4285f4, #34a853);
        color: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        animation: slideUp 0.3s ease-out;
      }

      @keyframes slideUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .pwa-banner-content {
        display: flex;
        align-items: center;
        padding: 16px;
        gap: 12px;
      }

      .pwa-banner-icon img {
        width: 48px;
        height: 48px;
        border-radius: 8px;
      }

      .pwa-banner-text {
        flex: 1;
      }

      .pwa-banner-text h3 {
        margin: 0 0 4px 0;
        font-size: 16px;
        font-weight: 600;
      }

      .pwa-banner-text p {
        margin: 0;
        font-size: 14px;
        opacity: 0.9;
      }

      .pwa-banner-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .pwa-install-btn {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .pwa-install-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: translateY(-1px);
      }

      .pwa-dismiss-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }

      .pwa-dismiss-btn:hover {
        opacity: 1;
      }

      @media (max-width: 480px) {
        .pwa-install-banner {
          left: 10px;
          right: 10px;
          bottom: 10px;
        }
        
        .pwa-banner-content {
          padding: 12px;
        }
        
        .pwa-banner-text h3 {
          font-size: 14px;
        }
        
        .pwa-banner-text p {
          font-size: 12px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);
    this.installBanner = banner;

    // Add event listeners
    const installBtn = banner.querySelector('#pwa-install');
    const dismissBtn = banner.querySelector('#pwa-dismiss');

    installBtn?.addEventListener('click', () => this.installApp());
    dismissBtn?.addEventListener('click', () => this.dismissInstallPrompt());
  }

  private async installApp() {
    if (!this.deferredPrompt) {
      this.showIOSInstallInstructions();
      return;
    }

    try {
      await this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      this.deferredPrompt = null;
      this.hideInstallPromotion();
    } catch (error) {
      console.error('Error during installation:', error);
    }
  }

  private dismissInstallPrompt() {
    this.hideInstallPromotion();
    // Store dismissal in localStorage to avoid showing again soon
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }

  private showIOSInstallInstructions() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      const modal = document.createElement('div');
      modal.className = 'ios-install-modal';
      modal.innerHTML = `
        <div class="ios-modal-content">
          <div class="ios-modal-header">
            <h3>Instalar Live Audio AI</h3>
            <button class="ios-modal-close">×</button>
          </div>
          <div class="ios-modal-body">
            <p>Para instalar este app no seu iPhone/iPad:</p>
            <ol>
              <li>Toque no botão <strong>Compartilhar</strong> <span style="font-size: 18px;">⬆️</span> na barra inferior</li>
              <li>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong> <span style="font-size: 18px;">➕</span></li>
              <li>Toque em <strong>"Adicionar"</strong> para confirmar</li>
            </ol>
            <div class="ios-visual-guide">
              <div class="ios-step">
                <div class="ios-step-icon">⬆️</div>
                <span>Compartilhar</span>
              </div>
              <div class="ios-arrow">→</div>
              <div class="ios-step">
                <div class="ios-step-icon">➕</div>
                <span>Adicionar à Tela</span>
              </div>
              <div class="ios-arrow">→</div>
              <div class="ios-step">
                <div class="ios-step-icon">✓</div>
                <span>Confirmar</span>
              </div>
            </div>
          </div>
        </div>
        <div class="ios-modal-overlay"></div>
      `;

      // Add iOS modal styles
      const iosStyle = document.createElement('style');
      iosStyle.textContent = `
        .ios-install-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .ios-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
        }

        .ios-modal-content {
          background: white;
          border-radius: 16px;
          max-width: 400px;
          width: 100%;
          position: relative;
          z-index: 1;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .ios-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 20px 0 20px;
        }

        .ios-modal-header h3 {
          margin: 0;
          color: #1d1d1f;
          font-size: 20px;
          font-weight: 600;
        }

        .ios-modal-close {
          background: none;
          border: none;
          font-size: 24px;
          color: #666;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        }

        .ios-modal-close:hover {
          background: #f0f0f0;
        }

        .ios-modal-body {
          padding: 20px;
        }

        .ios-modal-body p {
          margin: 0 0 16px 0;
          color: #1d1d1f;
          font-size: 16px;
        }

        .ios-modal-body ol {
          margin: 0 0 20px 0;
          padding-left: 20px;
          color: #1d1d1f;
        }

        .ios-modal-body li {
          margin-bottom: 8px;
          line-height: 1.5;
        }

        .ios-visual-guide {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8f9fa;
          padding: 16px;
          border-radius: 12px;
          margin-top: 16px;
        }

        .ios-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .ios-step-icon {
          width: 40px;
          height: 40px;
          background: #4285f4;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .ios-step span {
          font-size: 12px;
          text-align: center;
          color: #666;
          font-weight: 500;
        }

        .ios-arrow {
          color: #ccc;
          font-size: 18px;
          margin: 0 8px;
        }
      `;

      document.head.appendChild(iosStyle);
      document.body.appendChild(modal);

      // Add close functionality
      const closeBtn = modal.querySelector('.ios-modal-close');
      const overlay = modal.querySelector('.ios-modal-overlay');
      
      const closeModal = () => {
        modal.remove();
        iosStyle.remove();
      };

      closeBtn?.addEventListener('click', closeModal);
      overlay?.addEventListener('click', closeModal);
    }
  }

  private showInstalledMessage() {
    const toast = document.createElement('div');
    toast.className = 'pwa-toast';
    toast.innerHTML = `
      <div class="pwa-toast-content">
        <span class="pwa-toast-icon">✅</span>
        <span>App instalado com sucesso!</span>
      </div>
    `;

    const toastStyle = document.createElement('style');
    toastStyle.textContent = `
      .pwa-toast {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #34a853;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: toastSlideDown 0.3s ease-out;
      }

      @keyframes toastSlideDown {
        from {
          transform: translateX(-50%) translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }

      .pwa-toast-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .pwa-toast-icon {
        font-size: 18px;
      }
    `;

    document.head.appendChild(toastStyle);
    document.body.appendChild(toast);

    // Remove toast after 3 seconds
    setTimeout(() => {
      toast.remove();
      toastStyle.remove();
    }, 3000);
  }

  private showUpdateAvailable() {
    const updateBanner = document.createElement('div');
    updateBanner.className = 'pwa-update-banner';
    updateBanner.innerHTML = `
      <div class="pwa-update-content">
        <span>Nova versão disponível!</span>
        <button class="pwa-update-btn" id="pwa-update">Atualizar</button>
      </div>
    `;

    const updateStyle = document.createElement('style');
    updateStyle.textContent = `
      .pwa-update-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ff9800;
        color: white;
        z-index: 10000;
        animation: slideDown 0.3s ease-out;
      }

      @keyframes slideDown {
        from {
          transform: translateY(-100%);
        }
        to {
          transform: translateY(0);
        }
      }

      .pwa-update-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .pwa-update-btn {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s ease;
      }

      .pwa-update-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    `;

    document.head.appendChild(updateStyle);
    document.body.appendChild(updateBanner);

    const updateBtn = updateBanner.querySelector('#pwa-update');
    updateBtn?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  public async promptInstall() {
    if (this.deferredPrompt) {
      await this.installApp();
    } else {
      this.showIOSInstallInstructions();
    }
  }

  public isAppInstalled(): boolean {
    return this.isInstalled;
  }
}