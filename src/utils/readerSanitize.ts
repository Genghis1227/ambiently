import DOMPurify from 'dompurify';

// Reader view puts an article's HTML straight into the app's page. The server's cleanup in
// functions/api/reader.ts uses patterns, and HTML that its parser and the browser read differently
// (for example an <img onerror> inside <math><title>) gets past patterns. DOMPurify cleans the HTML
// with the browser's own parser right before it's shown, so what's checked is what's rendered.
// Only plain HTML is kept: no SVG or MathML, no forms (a fake PIN or sign-in box), no frames,
// styles or embedded objects.
export function sanitizeReaderHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'form', 'input', 'button', 'textarea', 'select', 'option', 'style', 'link', 'meta', 'base',
      'iframe', 'frame', 'frameset', 'object', 'embed', 'noscript', 'template',
    ],
    FORBID_ATTR: ['style', 'srcdoc', 'formaction', 'action'],
  });
}
