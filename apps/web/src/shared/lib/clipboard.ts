/** Copies text; falls back to a hidden textarea when the async Clipboard API is unavailable (http origins). */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithTextarea(text);
    }
  }
  return copyWithTextarea(text);
}

/**
 * Copies text that is still being loaded (e.g. fetched from the API). Safari drops the click's user activation
 * across `await`, so the pending text is handed to ClipboardItem synchronously; rejects when loading fails.
 */
export async function copyTextFrom(load: () => Promise<string>): Promise<boolean> {
  const text = load();
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined' && window.isSecureContext) {
    try {
      const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch {
      // Falls through: loading errors are rethrown below, clipboard errors use the textarea fallback.
    }
  }
  return copyText(await text);
}

function copyWithTextarea(text: string): boolean {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.append(el);
  el.select();
  const ok = document.execCommand('copy');
  el.remove();
  return ok;
}
