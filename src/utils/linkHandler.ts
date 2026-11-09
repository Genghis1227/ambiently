/**
 * Utilities for opening external links safely in kiosk and smart-display environments.
 */

export function openInAppWebViewer(url: string, title?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('open_in_app_web_viewer', { detail: { url, title } }));
}
