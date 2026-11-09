/**
 * Utilities for opening external links safely in kiosk and smart-display environments.
 */

export function openPopoutWindow(url: string) {
  if (typeof window === 'undefined') return;
  const width = Math.min(1150, Math.floor(window.screen.availWidth * 0.88));
  const height = Math.min(850, Math.floor(window.screen.availHeight * 0.88));
  const left = Math.floor((window.screen.availWidth - width) / 2);
  const top = Math.floor((window.screen.availHeight - height) / 2);

  const features = `popup=yes,width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=yes`;
  const pop = window.open(url, '_blank', features);
  if (pop) {
    pop.focus();
  }
}

export function openInAppWebViewer(url: string, title?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('open_in_app_web_viewer', { detail: { url, title } }));
}
