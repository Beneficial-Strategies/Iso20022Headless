/**
 * Putting things on the clipboard (or, where a browser will not, into a file). Nothing here leaves the browser.
 */
export type CopyResult = { ok: true; how: 'clipboard' | 'download' } | { ok: false; why: string };

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Older route for plain text: select a hidden text box and copy. Works where the async clipboard is not offered. */
function copyTextOldWay(text: string): boolean {
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.opacity = '0';
  document.body.appendChild(box);
  box.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
  }
}

export async function copyText(text: string): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, how: 'clipboard' };
    }
  } catch (e) {
    if (copyTextOldWay(text)) return { ok: true, how: 'clipboard' };
    return { ok: false, why: why(e) };
  }
  return copyTextOldWay(text) ? { ok: true, how: 'clipboard' } : { ok: false, why: 'the browser offers no clipboard access' };
}

/** HTML and its plain-text form together: a word processor takes the HTML, a plain editor the text. */
export async function copyRich(html: string, text: string): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return { ok: true, how: 'clipboard' };
    }
  } catch {
    /* fall through to plain text */
  }
  return copyText(text);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** An image on the clipboard; a browser that cannot do that gets the file instead. */
export async function copyPng(blob: Blob, fileName: string): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return { ok: true, how: 'clipboard' };
    }
  } catch {
    /* fall through to a download */
  }
  try {
    downloadBlob(blob, fileName);
    return { ok: true, how: 'download' };
  } catch (e) {
    return { ok: false, why: why(e) };
  }
}

/** A picture of an element as it is on screen (twice the pixels, so that it stays sharp in a document), with a margin around it. The library is loaded on first use. */
export async function elementToPng(element: HTMLElement): Promise<Blob> {
  const { toBlob } = await import('html-to-image');
  const computed = getComputedStyle(document.body).backgroundColor;
  const background = computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : '#ffffff';
  const picture = await toBlob(element, { pixelRatio: 2, backgroundColor: background, cacheBust: true });
  if (!picture) throw new Error('the picture could not be made');
  // the form runs right up to its edges: put it on a slightly larger sheet of the page's background
  const margin = 32;
  const bitmap = await createImageBitmap(picture);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width + 2 * margin;
  canvas.height = bitmap.height + 2 * margin;
  const ctx = canvas.getContext('2d');
  if (!ctx) return picture;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, margin, margin);
  bitmap.close();
  const framed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return framed ?? picture;
}
