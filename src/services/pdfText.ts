/**
 * Turns a PDF into plain text in the browser so the SDS reader can look at it.
 * pdf.js is loaded from a CDN the first time it is needed (it is large, and only used when an SDS is chosen).
 * If it cannot be loaded or the PDF has no text (a scan), the caller just carries on without reading.
 */

const VERSION = '4.10.38';
const LIB = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.min.mjs`;
const WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.worker.min.mjs`;

interface TextItem { str: string; transform: number[] }

let libPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

function loadLib() {
  if (!libPromise) {
    libPromise = import(/* @vite-ignore */ LIB).then(lib => {
      try {
        // A cross-origin worker has to be started through a small same-origin module that imports it.
        const blob = new Blob([`import "${WORKER}";`], { type: 'text/javascript' });
        lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob), { type: 'module' });
      } catch {
        lib.GlobalWorkerOptions.workerSrc = WORKER;
      }
      return lib;
    });
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

/** The text of the first 40 pages, one line per visual line. Throws if the PDF cannot be read. */
export async function readPdfText(file: File): Promise<string> {
  const lib = await loadLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  const count = Math.min(doc.numPages, 40);
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, TextItem[]>();
    for (const item of content.items as TextItem[]) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3);
      rows.set(y, [...(rows.get(y) ?? []), item]);
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).join(' '));
    pages.push(lines.join('\n'));
  }
  return pages.join('\n');
}
