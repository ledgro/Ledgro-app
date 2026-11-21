import { groupCatalog } from './catalogPdf';

// One product colour as a share-ready picture (1080 x 1350, 4:5, fits WhatsApp and Instagram).
// Cost price and supplier are never drawn: groupCatalog does not carry them.

export const CARD_W = 1080;
export const CARD_H = 1350;
const PAD = 56;
const GAP = 14;
const COLS = 5;
const NAME_LINE = 56;
const MIN_PHOTO = 240;

export const defaultImageOptions = { photos: true, prices: true, sizes: true, stock: false, hideSoldOut: false, skipNoPhoto: false };

/** Sizes shown on a card, honouring "hide sold-out". */
export function visibleSizes(card, o) {
  if (!o.sizes) return [];
  return card.variants.filter((v) => !(o.hideSoldOut && v.out));
}

/** Pure layout maths so it can be tested without a canvas. Everything is in pixels on the 1080 x 1350 card. */
export function cardLayout(card, o, W = CARD_W, H = CARD_H) {
  const sizes = visibleSizes(card, o);
  const cols = Math.min(COLS, Math.max(1, sizes.length));
  const chipW = (W - 2 * PAD - GAP * (cols - 1)) / cols;
  const chipRows = sizes.length ? Math.ceil(sizes.length / COLS) : 0;
  const chipH = o.stock ? (chipRows >= 3 ? 112 : 132) : (chipRows >= 3 ? 80 : 92);
  const chipBlock = chipRows ? chipRows * chipH + (chipRows - 1) * GAP : 0;
  const footerH = 56;
  const photoGap = o.photos ? 24 : 0;
  const nameTop = 0.8 * NAME_LINE; // first baseline below the photo gap
  const afterName = nameTop + NAME_LINE; // second line baseline (two lines of room, so cards line up)
  const priceOff = afterName + 72; // price baseline
  const chipsOff = (o.prices ? priceOff + 40 : afterName + 24);
  const tail = (chips) => (chips ? chipsOff + chipBlock : (o.prices ? priceOff : afterName));
  const used = photoGap + tail(sizes.length > 0);
  const photoH = Math.max(MIN_PHOTO, H - PAD - footerH - PAD - used);
  const photo = { x: PAD, y: PAD, w: W - 2 * PAD, h: o.photos ? photoH : 0 };
  const top = photo.y + photo.h + photoGap;
  const nameY = top + nameTop;
  const priceY = top + priceOff;
  const chipsY = top + chipsOff;
  const chips = sizes.map((v, k) => ({ v, x: PAD + (k % COLS) * (chipW + GAP), y: chipsY + Math.floor(k / COLS) * (chipH + GAP), w: chipW, h: chipH }));
  const bottom = top + tail(sizes.length > 0);
  return { photo, nameY, priceY, chips, chipH, bottom, fits: bottom <= H - PAD - footerH + 1 };
}

/** Largest font size (down to min) at which text fits width. measure(text, size) -> width. */
export function fitFont(measure, text, maxW, start, min = 16) {
  let fs = start;
  while (fs > min && measure(text, fs) > maxW) fs -= 1;
  return fs;
}

/** Splits into at most 2 lines; the last line gets "..." if it is cut. */
export function wrapTwoLines(measure, text, maxW, fs) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, fs) <= maxW) lines[lines.length - 1] = next;
    else if (lines.length < 2) lines.push(w);
    else { lines[1] = next; }
  }
  if (lines[1] && measure(lines[1], fs) > maxW) {
    let t = lines[1];
    while (t.length > 1 && measure(`${t}...`, fs) > maxW) t = t.slice(0, -1);
    lines[1] = `${t}...`;
  }
  return lines.filter(Boolean);
}

/** Safe file name: letters and digits joined by dashes. Unique when taken is given. */
export function safeFileName(name, ext = 'png', taken) {
  const base = String(name || 'product').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'product';
  let file = `${base}.${ext}`;
  if (taken) {
    let n = 2;
    while (taken.has(file.toLowerCase())) file = `${base}-${n++}.${ext}`;
    taken.add(file.toLowerCase());
  }
  return file;
}

/** Cards that will be made, and how many are skipped for having no photo. */
export function planImages(items, o) {
  const all = groupCatalog(items);
  const cards = o.skipNoPhoto ? all.filter((c) => c.img) : all;
  return { cards, skipped: all.length - cards.length };
}

const rupee = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Draws one card and returns a PNG blob. getImage(item) -> data URL or null. */
export async function renderCardPng(card, o, { getImage, shopName = '' } = {}) {
  const opts = { ...defaultImageOptions, ...o };
  const L = cardLayout(card, opts);
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext('2d');
  const F = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const measure = (t, fs, w = 700) => { g.font = `${w} ${fs}px ${F}`; return g.measureText(t).width; };

  g.fillStyle = '#ffffff'; g.fillRect(0, 0, CARD_W, CARD_H);

  if (opts.photos) {
    const { x, y, w, h } = L.photo;
    g.fillStyle = '#f1f5f9'; g.beginPath(); g.roundRect(x, y, w, h, 28); g.fill();
    let img = null;
    if (card.img && getImage) { try { const d = await getImage(card.img); if (d) img = await loadImg(d); } catch { img = null; } }
    if (img) {
      // Fit the whole photo inside the box (never stretched), centred.
      const s = Math.min(w / img.width, h / img.height);
      const dw = img.width * s; const dh = img.height * s;
      g.save(); g.beginPath(); g.roundRect(x, y, w, h, 28); g.clip();
      g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      g.restore();
    } else {
      g.fillStyle = '#94a3b8'; g.font = `600 36px ${F}`; g.textAlign = 'center';
      g.fillText('No photo', x + w / 2, y + h / 2);
    }
  }

  g.textAlign = 'left';
  g.fillStyle = '#0f172a';
  const lines = wrapTwoLines((t, fs) => measure(t, fs, 800), card.name, CARD_W - 2 * PAD, 48);
  g.font = `800 48px ${F}`;
  lines.forEach((ln, i) => g.fillText(ln, PAD, L.nameY + i * NAME_LINE));

  if (opts.prices) {
    g.fillStyle = '#1d4ed8'; g.font = `800 60px ${F}`;
    g.fillText(card.min === card.max ? rupee(card.min) : `${rupee(card.min)} - ${rupee(card.max)}`, PAD, L.priceY);
  }

  L.chips.forEach(({ v, x, y, w, h }) => {
    const dim = v.out && opts.stock;
    g.fillStyle = dim ? '#f1f5f9' : '#eff6ff'; g.strokeStyle = dim ? '#e2e8f0' : '#bfdbfe'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x, y, w, h, 18); g.fill(); g.stroke();
    const label = String(v.label);
    const fs = fitFont((t, s) => measure(t, s, 800), label, w - 16, 40, 16);
    g.font = `800 ${fs}px ${F}`; g.textAlign = 'center'; g.fillStyle = dim ? '#94a3b8' : '#0f172a';
    g.fillText(label, x + w / 2, y + (opts.stock ? h * 0.42 : h / 2 + fs * 0.35));
    if (opts.stock) {
      g.font = `600 30px ${F}`;
      g.fillStyle = v.qty == null ? '#64748b' : v.qty === 0 ? '#b91c1c' : '#15803d';
      g.fillText(v.qty == null ? '-' : String(v.qty), x + w / 2, y + h * 0.82);
    }
  });

  if (shopName) {
    g.textAlign = 'center'; g.fillStyle = '#94a3b8'; g.font = `600 28px ${F}`;
    g.fillText(shopName, CARD_W / 2, CARD_H - PAD / 2 - 4);
  }

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the picture.'))), 'image/png'));
}
