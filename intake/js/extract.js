// Turn a RIGHT 4.0 application packet into a profile draft.
//
// Three kinds of evidence, in descending order of trust:
//
//   form    a value typed into an Acrobat field. The state publishes these forms
//           fillable, so most organizations hand back a PDF whose answers are
//           machine-readable. Read exactly, not guessed.
//   grid    Attachment A, read by position: which column an X sits under is the
//           whole question, and the text alone does not answer it.
//   text    a value found by pattern in the printed page: delivery mode, dollar
//           bands, dates, languages, institution names in prose.
//
// Everything is a candidate with a weight, never an answer. A value that appears
// on five forms outvotes one that appears on a single page, the winner carries
// the list of who said it, and a real disagreement is shown rather than smoothed
// over. This module has no DOM and no pdf.js import, so the same code that runs
// in the browser can be run over a sample packet from the command line.

const has = (v) => v != null && String(v).trim() !== '';
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- catalogue */
export function compile(catalog) {
  return {
    ...catalog,
    docs: catalog.documents.map((d) => ({
      ...d,
      _fingerprints: (d.fingerprints || []).map((p) => new RegExp(p, 'i')),
      _continues: d.continues ? new RegExp(d.continues, 'i') : null,
      _text: (d.text || []).map((r) => ({ ...r, _re: new RegExp(r.pattern, r.flags || 'i') })),
      _checks: (d.checks || []).map((r) => ({ ...r, _re: new RegExp(r.pattern, r.flags || 'i') })),
      _names: d.names || {},
      _grid: d.grid || null,
    })),
    _verifiers: (catalog.verifiers || []).map((v) => ({ ...v, _re: new RegExp(v.pattern, 'gi') })),
    _blockers: (catalog.blockers || []).map((b) => ({ ...b, _re: new RegExp(b.pattern, 'gi') })),
  };
}

/* ------------------------------------------------------------ classification */
/**
 * Which document is each page of each uploaded file?
 *
 * A packet is usually one PDF with fifteen forms inside it, so pages are matched
 * one at a time and the most specific match wins: STD 205 also says "payee data
 * record", but only STD 204 says "STD 204 (Rev".
 */
export function classify(files, cat, assignments = {}) {
  // A page with no form fields is not one of the state's fillable forms. Unless
  // the whole upload has no fields at all — somebody printed the packet to PDF —
  // in which case that rule would refuse to read anything and is dropped.
  const anyWidgets = files.some((f) => f.pages.some((p) => p.widgets.length));
  const found = new Map();
  const loose = [];
  const pageDoc = new Map(); // file -> Map(pageNumber -> docId)

  const claim = (docId, file, page) => {
    if (!found.has(docId)) found.set(docId, { id: docId, pages: [], files: new Set() });
    found.get(docId).pages.push({ file, page });
    found.get(docId).files.add(file);
    if (!pageDoc.has(file)) pageDoc.set(file, new Map());
    pageDoc.get(file).set(page.n, docId);
  };

  for (const f of files) {
    let previous = null;
    for (const page of f.pages) {
      // A form says its own name at the top. Matching the whole page instead
      // reads nine pages of RFA narrative that merely *discuss* the forms as if
      // they were the forms, which is how a packet ends up with four budgets.
      const head = page.lines.slice(0, 6).join('\n');
      const guesses = cat.docs
        .filter((d) => !d.manual && d._fingerprints.length)
        .filter((d) => !(d.form && anyWidgets && !page.widgets.length))
        .filter((d) => {
          const text = d.head ? head : page.text;
          return d._fingerprints.every((re) => re.test(text));
        })
        .sort((a, b) => specificity(b) - specificity(a));

      let match = guesses[0] || null;
      if (!match && previous?._continues?.test(page.text)) match = previous;
      // A blank page between two pages of one form belongs to that form.
      if (!match && previous && !page.text.trim()) match = previous;

      if (!match) {
        loose.push({ file: f.name, page: page.n, text: page.text.slice(0, 140) });
        previous = null;
        continue;
      }
      claim(match.id, f.name, page);
      previous = match;
    }
  }

  // Documents whose shape varies too much to fingerprint — a budget spreadsheet,
  // an insurance certificate, two pages of prose, a screenshot of the Secretary
  // of State — land where the person put them.
  for (const [docId, fileName] of Object.entries(assignments)) {
    const file = files.find((x) => x.name === fileName);
    if (!file) continue;
    for (const page of file.pages) claim(docId, file.name, page);
  }

  const documents = cat.docs.map((d) => {
    const hit = found.get(d.id);
    const pages = hit ? hit.pages : [];
    return {
      id: d.id,
      label: d.label,
      short: d.short || d.label,
      section: d.section,
      required: !!d.required,
      manual: !!d.manual,
      found: pages.length > 0,
      assigned: !!assignments[d.id],
      pages: pages.map((p) => p.page.n),
      files: hit ? [...hit.files] : [],
      note: d.note || '',
      reads: d.reads || [],
      text: pages.map((p) => p.page.text).join('\n').trim(),
      pageRefs: pages,
    };
  });

  return { documents, loose, pageDoc };
}

function specificity(d) {
  return d._fingerprints.reduce((n, re) => n + re.source.length, 0) + d._fingerprints.length * 10;
}

/* -------------------------------------------------------------------- values */
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function toISO(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return '';
}

const DELIVERY = [
  [/\bin[- ]person\b/i, 'in_person'],
  [/correspondence/i, 'correspondence'],
  [/hybrid/i, 'hybrid'],
];

export function deliveryOf(text) {
  for (const [re, value] of DELIVERY) if (re.test(text || '')) return value;
  return '';
}

function tidy(key, value) {
  if (!has(value)) return '';
  const s = clean(value).replace(/^[:\-\u2013]\s*/, '');
  if (!s) return '';
  if (/date|signed_on|funding|due/.test(key)) return toISO(s) || '';
  if (key === 'program.capacity') {
    const n = Number(s.replace(/[^0-9]/g, ''));
    return Number.isInteger(n) && n > 0 && n <= 5000 ? n : '';
  }
  if (key === 'org.address_state') {
    const m = s.match(/\b([A-Z]{2})\b/);
    return m ? m[1] : '';
  }
  if (key === 'org.address_zip') {
    const m = s.match(/\b\d{5}(?:-\d{4})?\b/);
    return m ? m[0] : '';
  }
  if (/email/.test(key)) {
    const m = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0] : '';
  }
  if (/summary/.test(key)) return s.slice(0, 600);
  return s.slice(0, /address|name/.test(key) ? 120 : 200);
}

/* --------------------------------------------------------- label fallback */
// For a revision of a form we have never seen, the field's name is not in the
// catalogue — but the printed caption is still on the page, to the left of the
// box or just above it. This is the guess of last resort and it is labelled as
// one in the review screen.
const CAPTIONS = [
  [/\b(dba|doing business as|business name, dba)\b/i, 'org.dba'],
  [/(legal name|^\s*name\b|name of (the )?(business|organization))/i, 'org.legal_name'],
  [/(tax ?id|fein|federal (id|employer)|employer identification|\bein\b)/i, 'fein'],
  [/(e-?mail)/i, 'signatory.email'],
  [/^\s*title\b/i, 'signatory.title'],
  [/(telephone|phone)/i, 'signatory.phone'],
  [/(authorized|signatory|representative).*(name|person)/i, 'signatory.name'],
  [/(street|physical address|mailing address)/i, 'org.address_street'],
  [/^\s*city\b/i, 'org.address_city'],
  [/^\s*state\b/i, 'org.address_state'],
  [/^\s*zip\b/i, 'org.address_zip'],
  [/(web-?site|web address|url)/i, 'org.website'],
  [/(date executed|signed|^\s*date\b)/i, 'signatory.signed_on'],
];

function captionFor(widget, page) {
  const [x1, y1, x2, y2] = widget.rect;
  const items = page.items || [];
  const midY = (y1 + y2) / 2;

  const left = items
    .filter((it) => Math.abs(it.y + (it.h || 0) / 2 - midY) < 7 && it.x + it.w <= x1 + 4 && it.x + it.w > x1 - 170)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (left) return { text: left, where: 'left' };

  const above = items.filter(
    (it) => it.y >= y2 - 2 && it.y <= y2 + 14 && it.x + it.w > x1 - 6 && it.x < x2 + 6
  );
  if (!above.length) return { text: '', where: '' };
  const base = above.reduce((best, it) => (it.y > best ? it.y : best), -Infinity);
  const text = above
    .filter((it) => Math.abs(it.y - base) < 1.5)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, where: 'above' };
}

/* ------------------------------------------------------------------ the read */
/**
 * @param {{files: Array<{name:string, pages:Array}>, catalog: object, facilities: Array, assignments?: object}} input
 */
export function buildDraft({ files, catalog, facilities, reference = null, assignments = {} }) {
  const cat = catalog.docs ? catalog : compile(catalog);
  const { documents, loose, pageDoc } = classify(files, cat, assignments);

  const pageByFile = new Map(files.map((f) => [f.name, new Map(f.pages.map((p) => [p.n, p]))]));
  const byId = new Map(documents.map((d) => [d.id, d]));
  const candidates = [];
  const sites = new Map();
  const checks = {};
  const verify = { fein: [], signature: [] };

  const add = (key, value, weight, source, method) => {
    const v = tidy(key, value);
    if (has(v)) candidates.push({ key, value: v, weight, source, method });
  };

  for (const doc of documents) {
    if (!doc.found) continue;
    const spec = cat.docs.find((d) => d.id === doc.id);
    const docLabel = doc.short;

    for (const { file, page } of doc.pageRefs) {
      const source = pageByFile.get(file)?.get(page.n);
      if (!source) continue;

      for (const blocker of cat._blockers) {
        if (!blocker.warn && blocker._re.test(source.text)) {
          checks.refused = { id: blocker.id, label: blocker.label, page: page.n, file };
        }
      }

      for (const w of source.widgets) {
        if (!has(w.value)) continue;
        const mapping = spec._names[w.name];

        if (typeof mapping === 'string') {
          add(mapping, w.value, 3, docLabel, 'form');
        } else if (mapping?.citystatezip) {
          const m = clean(w.value).match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
          if (m) {
            add(mapping.to[0], m[1], 3, docLabel, 'form');
            add(mapping.to[1], m[2], 3, docLabel, 'form');
            add(mapping.to[2], m[3], 3, docLabel, 'form');
          }
        } else if (mapping?.name_title) {
          const [name, title] = splitNameTitle(w.value);
          add(mapping.to[0], name, 2, docLabel, 'form');
          add(mapping.to[1], title, 2, docLabel, 'form');
        } else if (mapping?.checked) {
          if (!/^(off|no|false)$/i.test(clean(w.value))) {
            for (const [k, v] of Object.entries(mapping.checked)) add(k, v, 3, docLabel, 'form');
          }
        } else if (mapping?.verify) {
          verify[mapping.verify]?.push({ value: clean(w.value), doc: docLabel });
        } else if (mapping?.to) {
          // An object mapping: one field, sometimes at lower trust because the
          // form asks a related question rather than the same one.
          add(mapping.to, w.value, mapping.weight ?? 3, docLabel, 'form');
        } else if (!mapping) {
          if (w.type === 'Btn') {
            if (!/^(yes|on|1|true)$/i.test(clean(w.value))) continue;
            const cap = captionFor(w, source);
            if (/exempt|non-?profit|501/i.test(cap.text)) add('org.entity', 'nonprofit_corp', 2, docLabel, 'form · checked box');
            continue;
          }
          const cap = captionFor(w, source);
          if (!cap.text) continue;
          for (const [re, key] of CAPTIONS) {
            if (!re.test(cap.text)) continue;
            if (key === 'fein') verify.fein.push({ value: clean(w.value), doc: docLabel });
            else add(key, w.value, 2, `${docLabel} \u00b7 "${cap.text.slice(0, 40)}"`, `caption-${cap.where}`);
            break;
          }
        }

        if (mapping?.delivery) {
          const d = deliveryOf(w.value);
          if (d) add('program.delivery', d, 2, docLabel, 'form');
        }
        if (mapping?.sites) mentionSites(w.value, sites, facilities, `${docLabel} \u00b7 description`, 2);
      }

      for (const rule of spec._text) {
        const m = source.text.match(rule._re);
        if (!m) continue;
        const raw = rule.literal !== undefined ? rule.literal : m[1] ?? m[0];
        add(rule.key, applyTransform(raw, rule.transform, rule.prefix), rule.weight || 1, docLabel, 'text');
      }

      for (const rule of spec._checks) {
        const m = source.text.match(rule._re);
        if (!m) continue;
        let value = rule.literal !== undefined ? rule.literal : m[1] ?? m[0];
        if (rule.transform === 'money') value = Number(String(value).replace(/[^0-9]/g, ''));
        if (rule.invert) value = !value;
        checks[rule.id] = value;
      }

      if (spec._grid) {
        const grid = readGrid(source, spec._grid, sites, facilities, reference);
        if (grid.disputed.length) checks.grid_disputed = [...new Set([...(checks.grid_disputed || []), ...grid.disputed])];
        checks.grid_readable = grid.fontTells;
      }

      for (const v of cat._verifiers) {
        v._re.lastIndex = 0;
        for (const h of source.text.matchAll(v._re)) {
          verify[v.id]?.push({ value: h[0], doc: docLabel });
        }
      }
    }

    // Money: the budget PDFs are read for a band and nothing else. The figures
    // stay on the page. A member organization's budget does not belong in a
    // public repository, and all the RFA asks of it is which of three bands it
    // falls into.
    if (spec.money) {
      const amounts = [...doc.text.matchAll(/\$?\s?([0-9]{1,3}(?:,[0-9]{3}){2,})(?:\.\d{2})?/g)]
        .map((m) => Number(m[1].replace(/,/g, '')))
        .filter((n) => n > 1000);
      if (amounts.length) checks.budget_total = Math.max(...amounts);
    }

    // Prose the catalogue can only guess at, and only from documents that are
    // about this organization's own program.
    const delivery = deliveryOf(doc.text);
    if (delivery && /program summary|obs 1000|vendor/i.test(doc.label)) {
      add('program.delivery', delivery, 2, docLabel, 'text');
    }
    // Attachment A lists all thirty-two institutions by design. Reading *it*
    // for institution names would claim every prison in the state.
    if (spec.mentions) mentionSites(doc.text, sites, facilities, `${docLabel} \u00b7 mentions`, 1);
  }

  // FEIN: the same nine digits should appear on every signed form. We keep the
  // count and the agreement, never the number.
  const digits = verify.fein.map((f) => f.value.replace(/[^0-9]/g, '')).filter((v) => v.length === 9);
  checks.fein = {
    seen: digits.length,
    documents: new Set(verify.fein.map((f) => f.doc)).size,
    consistent: new Set(digits).size <= 1,
    disputed: new Set(digits).size > 1,
  };
  checks.signed = verify.signature.length > 0;

  // The grid is the answer. Free-text mentions only pre-tick a box the
  // organization did not tick, and never override a tick.
  const grid = [...sites.values()].filter((s) => s.from === 'grid');
  const mentioned = [...sites.values()].filter((s) => s.from !== 'grid');
  const siteList = (grid.length ? [...grid, ...mentioned] : mentioned).sort((a, b) =>
    a.facility.localeCompare(b.facility)
  );

  const fields = merge(candidates, cat);
  if (grid.length) delete fields.sites;

  const languages = fields['program.languages']?.value || [];
  if (languages.length) {
    for (const s of siteList) if (s.language && !s.languages.length) s.languages = languages;
  }

  const tier = bandTier(checks.budget_total ?? null);
  const points = pointsFor({ tier, sites: siteList, languages });

  return {
    documents: documents.map(({ pageRefs, ...d }) => d),
    loose,
    fields,
    sites: siteList,
    checks,
    points,
    budget_total: checks.budget_total ?? null,
    budget_band: bandLabel(checks.budget_total ?? null),
    filled: Object.keys(fields).length,
    expected: (cat.fields || []).length,
  };
}

/* ------------------------------------------------------------------ helpers */
export function bandTier(amount) {
  if (amount == null) return null;
  return amount < 250000 ? 1 : amount <= 500000 ? 2 : 3;
}

export function bandLabel(amount) {
  if (amount == null) return null;
  return amount < 250000 ? 'under $250,000' : amount <= 500000 ? '$250,000 to $500,000' : 'above $500,000';
}

function splitNameTitle(value) {
  const s = clean(value);
  const m = s.match(/^(.+?),\s*(.+)$/);
  if (m) return [m[1].trim(), m[2].trim()];
  const parts = s.split(/\s{2,}|\s+-\s+/);
  if (parts.length > 1) return [parts[0].trim(), parts.slice(1).join(' ').trim()];
  return [s, ''];
}

function applyTransform(raw, transform, prefix) {
  const s = clean(raw);
  switch (transform) {
    case 'us_date': return toISO(s);
    case 'delivery': return deliveryOf(s);
    case 'int': return s.replace(/[^0-9]/g, '');
    case 'lower': return s.toLowerCase();
    case 'languages': return [s];
    case 'money': return s.replace(/[^0-9]/g, '');
    default: return prefix ? `${prefix}${s}` : s;
  }
}

/**
 * Attachment A: an X is an X because of which column it sits under.
 *
 * Two kinds of mark share this page and they mean opposite things. The state
 * prints a lowercase x in a column an institution does *not* house — a legend,
 * not a selection. The applicant's own ticks are typed afterwards, in the
 * applicant's font.
 *
 * So a mark in a different font from the table's body text is a selection. A
 * mark in the body font is the legend, and data/public/cdcr-attachment-a-
 * institutions.csv, which we already keep, confirms which cells those are. The
 * alternative — reading every x as a tick — claims a program in thirty prisons.
 */
function readGrid(page, grid, sites, facilities, reference) {
  const markRe = new RegExp(`^(?:${grid.marks})$`, 'i');
  const items = page.items || [];

  const headerY = items
    .filter((it) => grid.caption_columns.some((c) => it.str.toUpperCase() === c))
    .map((it) => it.y)
    .sort((a, b) => b - a)[0];
  if (headerY == null) return { disputed: [], fontTells: false };

  const columns = new Map();
  for (const it of items) {
    if (Math.abs(it.y - headerY) > 6) continue;
    const name = it.str.toUpperCase();
    if (grid.caption_columns.includes(name) && !columns.has(name)) columns.set(name, it.x);
  }
  if (!columns.size) return { disputed: [], fontTells: false };

  const langItem = items.find(
    (it) => Math.abs(it.y - headerY) < 24 && new RegExp(grid.language_header, 'i').test(it.str)
  );
  const langX = langItem ? langItem.x : Math.max(...columns.values()) + 50;

  const rows = items
    .filter((it) => it.x < 320 && /\([A-Z]{2,4}\)/.test(it.str))
    .map((it) => ({ code: (it.str.match(/\(([A-Z]{2,4})\)/) || [])[1], label: it.str, y: it.y, font: it.font }));
  if (!rows.length) return { disputed: [], fontTells: false };

  // Marks typed by the applicant are set in a different font from the table's
  // own body text. When the whole page uses one font — a re-typed form, a
  // flattened scan that kept its text layer — fall back to the public grid.
  const bodyFont = mode(rows.map((r) => r.font).filter(Boolean));
  const fonts = new Set(items.map((it) => it.font).filter(Boolean));
  const fontTells = fonts.size > 1;

  const marks = items.filter((it) => it.x > 320 && markRe.test(it.str) && Math.abs(it.y - headerY) > 8);
  const disputed = [];
  const columnOf = (m) => {
    for (const [name, x] of columns) if (Math.abs(m.x - x) <= 14) return name;
    return Math.abs(m.x - langX) <= 16 ? 'LANGUAGE' : null;
  };

  for (const row of rows) {
    const near = marks.filter((m) => Math.abs(m.y - row.y) <= 6);
    const ref = reference?.get(row.code) || null;
    const picked = [];
    let language = false;

    for (const m of near) {
      const column = columnOf(m);
      if (!column) continue;
      const typed = fontTells && bodyFont && m.font && m.font !== bodyFont;
      if (!typed) {
        // A mark in the table's own font is the state's legend, not a tick. If
        // the public grid says this institution *does* house the population,
        // the page disagrees with the state's own list — worth a flag, never a
        // selection.
        if (ref && ref[column] === true) disputed.push(row.code);
        continue;
      }
      if (column === 'LANGUAGE') language = true;
      else if (!picked.includes(column)) picked.push(column);
    }

    if (!picked.length && !language) continue;

    const known = facilities.find((f) => f.code === row.code);
    const site = sites.get(row.code) || {
      code: row.code,
      facility: known?.name || row.label.replace(/\s*\([A-Z]{2,4}\).*/, ''),
      reference: !!known,
      populations: [],
      languages: [],
      language: false,
      underserved: false,
      from: 'grid',
      pages: [],
    };
    site.populations = [...new Set([...site.populations, ...picked])].sort();
    site.language = site.language || language;
    site.underserved = site.underserved || /\*/.test(row.label);
    if (ref && ref.underserved === true) site.underserved = true;
    site.from = 'grid';
    site.pages = [...new Set([...site.pages, page.n])];
    sites.set(row.code, site);
  }

  return { disputed: [...new Set(disputed)], fontTells };
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Institutions named in prose, so a facility in a summary pre-ticks a box. */
function mentionSites(text, sites, facilities, source, weight) {
  if (!text) return;
  for (const f of facilities) {
    const codeHit = new RegExp(`\\b${f.code}\\b`).test(text);
    const bare = f.name.split('(')[0].trim();
    const nameHit = bare.length > 8 && text.includes(bare);
    if (!codeHit && !nameHit) continue;
    const existing = sites.get(f.code);
    if (existing) {
      if (existing.from !== 'grid') existing.mentions = (existing.mentions || 1) + 1;
      continue;
    }
    sites.set(f.code, {
      code: f.code,
      facility: f.name,
      reference: true,
      populations: [],
      languages: [],
      language: false,
      underserved: false,
      from: 'mention',
      source,
      pages: [],
      mentions: 1,
    });
  }
}

/** Vote the candidates into one answer per field, and say who said it. */
function merge(candidates, cat) {
  const spec = new Map((cat.fields || []).map((f) => [f.key, f]));
  const groups = new Map();

  for (const c of candidates) {
    if (!groups.has(c.key)) groups.set(c.key, new Map());
    const bucket = groups.get(c.key);
    const id = String(c.value).toLowerCase();
    const prior = bucket.get(id) || { value: c.value, bySource: new Map(), sources: [] };
    // One document gets one vote however many times it repeats itself. Without
    // this, a phrase that appears on two pages of the RFA outvotes a signed form.
    const best = prior.bySource.get(c.source) || 0;
    if (c.weight > best) prior.bySource.set(c.source, c.weight);
    if (!prior.sources.some((s) => s.source === c.source && s.method === c.method)) {
      prior.sources.push({ source: c.source, method: c.method });
    }
    bucket.set(id, prior);
  }

  const out = {};
  for (const [key, bucket] of groups) {
    const ranked = [...bucket.values()]
      .map((v) => ({ ...v, weight: [...v.bySource.values()].reduce((n, w) => n + w, 0) }))
      .sort((a, b) => b.weight - a.weight || b.sources.length - a.sources.length);
    const top = ranked[0];
    const runnerUp = ranked[1];
    if (!top || top.weight < 2) continue;
    const field = spec.get(key);
    out[key] = {
      value: top.value,
      confidence: top.weight >= 6 || top.sources.length >= 2 ? 'high' : top.weight >= 3 ? 'medium' : 'low',
      sources: top.sources,
      conflict: runnerUp && runnerUp.weight >= top.weight * 0.75 ? runnerUp.value : null,
      privacy: field?.privacy || 'commit',
      label: field?.label || key,
    };
  }
  return out;
}

/** RFA §9: points for the budget band, plus at most one extra point. */
export function pointsFor({ tier, sites, languages }) {
  const extra = [];
  if (sites.some((s) => s.underserved)) extra.push({ why: 'underserved institution', points: 0.5 });
  if (sites.some((s) => s.populations.some((p) => ['EOP', 'MHCB', 'RHU'].includes(p)))) {
    extra.push({ why: 'special population', points: 0.5 });
  }
  if ((languages || []).length || sites.some((s) => s.language)) {
    extra.push({ why: 'a language other than English', points: 0.5 });
  }
  const extraPoints = Math.min(1, extra.reduce((n, e) => n + e.points, 0));
  return {
    budget_tier: tier,
    base: tier || 0,
    extra,
    extra_points: extraPoints,
    total: (tier || 0) + extraPoints,
    max: 4,
  };
}
