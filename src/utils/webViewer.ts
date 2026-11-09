export function openInAppWebViewer(url: string, title?: string): void {
  if (typeof window === 'undefined' || !url) return;
  window.dispatchEvent(
    new CustomEvent('open_in_app_web_viewer', {
      detail: { url, title },
    })
  );
}
