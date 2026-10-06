/** Saving what the form holds as a file, and reading a file back. The files are ordinary ISO 20022 XML or JSON. */

export type FileFormat = 'xml' | 'json';

/** The most we will read from a file. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * A whole message is named after its identifier (`pain.002.001.15.xml`); a single component after the message it
 * belongs to and its type (`pain.002.001.15_GroupHeader128.xml`), so a folder of examples sorts by message.
 */
export function saveFileName(identifier: string, typeName: string, rootType: string, format: FileFormat): string {
  return `${typeName === rootType ? identifier : `${identifier}_${typeName}`}.${format}`;
}

/** Hand the browser a file to save (it goes to the Downloads folder, or asks, depending on the browser's setting). */
export function downloadText(name: string, text: string, format: FileFormat): void {
  const blob = new Blob([text], { type: format === 'xml' ? 'application/xml' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type FileRead = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' };

/** `File.text()` where it exists, a FileReader where it does not (older browsers, jsdom). */
const readAll = (file: File): Promise<string> =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });

export async function readTextFile(file: File, maxBytes = MAX_FILE_BYTES): Promise<FileRead> {
  if (file.size > maxBytes) return { ok: false, reason: 'too_large' };
  try {
    return { ok: true, text: await readAll(file) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
