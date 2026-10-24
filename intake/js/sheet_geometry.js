// One source of truth for the printed sheet's geometry.
//
// Positions are PostScript points (1pt = 1/72in) on US Letter. The sheet is drawn
// with absolute positioning from these numbers, and the scanner projects the QR
// code's four corners into the photograph with the same numbers. Move a box and
// both ends move.

export const PAGE = { w: 612, h: 792 };

export const QR = { x: 472, y: 30, size: 104 };

export const TITLE = { x: 36, y: 44 };
export const LEDE = { x: 36, y: 62 };
export const META = { x: 36, y: 84, line: 16 };

export const TABLE = {
  head: 172,
  rule: 182,
  firstRow: 196,
  rowHeight: 30,
  rows: 16,
};
TABLE.bottom = TABLE.firstRow + TABLE.rowHeight * TABLE.rows;

export const COL = {
  num: { x: 36, w: 22 },
  id: { x: 58, w: 54 },
  name: { x: 114, w: 126 },
  present: { x: 246, w: 36 },
  age: { x: 286, w: 44 },
  gender: { x: 332, w: 46 },
  race: { x: 380, w: 72 },
  school: { x: 454, w: 50 },
  notes: { x: 506, w: 70 },
};

/** Tick box for row i, in sheet points. */
export function checkBox(i) {
  const y = TABLE.firstRow + i * TABLE.rowHeight + (TABLE.rowHeight - 18) / 2;
  return { x: COL.present.x + 6, y, w: 18, h: 18 };
}

export const rowY = (i) => TABLE.firstRow + i * TABLE.rowHeight;

/**
 * Projective map from sheet points to photograph pixels, driven by the QR's four
 * corners. An affine map (3 corners) drifts once the page is tilted; a homography
 * (4 corners) does not, which matters when someone photographs a sheet on a desk.
 */
export function sheetToImage(location) {
  const p0 = location.topLeftCorner;
  const p1 = location.topRightCorner;
  const p2 = location.bottomRightCorner;
  const p3 = location.bottomLeftCorner;
  if (!p0 || !p1 || !p2 || !p3) return affineFallback(location);

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let a;
  let b;
  let c;
  let d;
  let e;
  let f;
  let g;
  let h;

  if (Math.abs(dx3) < 1e-6 && Math.abs(dy3) < 1e-6) {
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-6;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }

  return (px, py) => {
    const u = (px - QR.x) / QR.size;
    const v = (py - QR.y) / QR.size;
    const w = g * u + h * v + 1 || 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

function affineFallback({ topLeftCorner, topRightCorner, bottomLeftCorner }) {
  const ux = (topRightCorner.x - topLeftCorner.x) / QR.size;
  const uy = (topRightCorner.y - topLeftCorner.y) / QR.size;
  const vx = (bottomLeftCorner.x - topLeftCorner.x) / QR.size;
  const vy = (bottomLeftCorner.y - topLeftCorner.y) / QR.size;
  return (px, py) => {
    const du = px - QR.x;
    const dv = py - QR.y;
    return { x: topLeftCorner.x + ux * du + vx * dv, y: topLeftCorner.y + uy * du + vy * dv };
  };
}

/** Photograph pixels per sheet point. */
export function imageScale(location) {
  const a = location.topLeftCorner;
  const b = location.topRightCorner;
  return Math.hypot(b.x - a.x, b.y - a.y) / QR.size;
}
