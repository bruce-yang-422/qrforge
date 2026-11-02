/* Installation is offered only when the browser provides a native prompt. */
(() => {
  const installButton = document.getElementById('install-btn');
  const status = document.getElementById('pwa-status');
  let installPrompt = null;
  let offlineReady = false;
  let failed = false;

  function updateStatus() {
    if (failed) status.textContent = tr('離線功能尚未就緒', 'Offline mode not ready');
    else if (!offlineReady) status.textContent = '';
    else status.textContent = navigator.onLine ? tr('✓ 可離線使用', '✓ Works offline') : tr('離線模式', 'Offline');
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    installButton.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn('PWA installation prompt failed:', error);
    }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  document.addEventListener('qrlangchange', updateStatus);

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      offlineReady = true;
    } catch (error) {
      failed = true;
      console.warn('Service worker registration failed:', error);
    }
    updateStatus();
  });
})();
