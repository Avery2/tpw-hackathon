// Read a PDF in the browser: the text on each page, with positions, and the
// values sitting in its AcroForm fields.
//
// Two things matter here. First, nothing leaves the page — the bytes are read
// with pdf.js and never posted anywhere, which is the only way a member
// organization's tax forms and budgets can be looked at without publishing
// them. Second, positions: a grid in a PDF has no structure, only characters at
// coordinates, so the extractor downstream needs x and y to know which row an
// X belongs to.

import { GlobalWorkerOptions, getDocument } from '../vendor/pdfjs/pdf.min.mjs';

GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

/** Group text runs into visual lines, top down, left to right. */
function lines(items) {
  const rows = new Map();
  for (const it of items) {
    const key = Math.round(it.y / 3) * 3;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

/**
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<{numPages:number, pages:Array, widgets:Array, text:string}>}
 */
export async function readPdf(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const task = getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });
  const doc = await task.promise;

  const pages = [];
  const widgets = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);

    let content = { items: [] };
    try {
      content = await page.getTextContent();
    } catch {
      // A page that will not give up its text is a scanned page. It still
      // counts as a page of the document; it just has nothing to say.
    }

    const items = content.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({
        str: i.str.trim(),
        x: i.transform[4],
        y: i.transform[5],
        w: i.width || 0,
        h: i.height || 0,
        // The font a run was set in. It is how Attachment A tells the state's
        // printed legend apart from the applicant's own ticks.
        font: i.fontName || '',
      }));

    let anns = [];
    try {
      anns = await page.getAnnotations();
    } catch {
      anns = [];
    }

    const pageWidgets = anns
      .filter((a) => a.subtype === 'Widget' || a.fieldName)
      .map((a) => ({
        page: n,
        name: a.fieldName || '',
        type: a.fieldType || a.subtype,
        value: normalise(a.fieldValue),
        rect: (a.rect || [0, 0, 0, 0]).map((v) => Math.round(v * 100) / 100),
      }));

    widgets.push(...pageWidgets);

    const pageLines = lines(items);
    pages.push({
      n,
      width: page.view[2] - page.view[0],
      height: page.view[3] - page.view[1],
      items,
      widgets: pageWidgets,
      lines: pageLines,
      text: pageLines.join('\n'),
    });

    page.cleanup();
  }

  const info = await doc.getMetadata().catch(() => ({}));
  // destroy() lives on the loading task in this version of pdf.js, not on the
  // document proxy. Releasing both is what stops a 30-page packet from holding
  // a worker's memory for the rest of the session.
  await task.destroy();

  return {
    numPages: pages.length,
    pages,
    widgets,
    text: pages.map((p) => p.text).join('\n'),
    title: (info?.info?.Title || '').slice(0, 120) || null,
  };
}

function normalise(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return String(value);
  // Acrobat joins multi-line field values with CRLF; keep the line breaks, they
  // are often what separates "name" from "title" on a shared field.
  return value.replace(/\r\n?/g, '\n').trim();
}
