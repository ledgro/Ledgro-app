import { rs } from './reportExport';
import { colourOf, colourKey, colourLabel, sizeLabelOf } from './variants';

/** One entry per product and colour: sizes of the same shoe are folded into a single card. */
export function groupCatalog(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = it.groupId ? `${it.groupId}~${colourKey(it)}` : it.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  });
  return [...map.values()].map((list) => {
    const first = list[0];
    const colour = first.groupId ? colourLabel(colourOf(first)) : '';
    const prices = list.map((i) => Number(i.lastUsedPrice) || 0);
    const tracked = list.filter((i) => i.stockCount != null);
    const base = first.groupId ? (first.baseName || first.name) : first.name;
    return {
      name: colour ? `${base} - ${colour}` : base,
      category: (first.category || '').trim(),
      img: list.find((i) => i.hasImage) || null,
      min: Math.min(...prices),
      max: Math.max(...prices),
      unit: first.unit,
      variants: first.groupId ? list.map((i) => ({ label: sizeLabelOf(i), qty: i.stockCount == null ? null : Math.max(0, i.stockCount), out: i.stockCount != null && i.stockCount <= 0 })) : [],
      stock: tracked.length ? tracked.reduce((a, i) => a + Math.max(0, i.stockCount), 0) : null,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * Product catalog PDF: sections by category, 3 cards per row with photo, name, price
 * (range when sizes differ), available sizes and stock. Cost price is never printed.
 */
export async function buildCatalogPdf({ shopName, items, getImage, subtitle = '', options = {} }) {
  const o = { photos: true, prices: true, stock: true, sizes: true, byCategory: true, ...options };
  const { jsPDF } = await import('jspdf');
  const products = groupCatalog(items);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const cols = o.photos ? 3 : 4;
  const gap = 5;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols;
  const ih = o.photos ? cw * 0.9 : 0;
  const perRow = cols === 3 ? 4 : 5;
  const chipGap = 1.2;
  const chipW = (cw - 4 - chipGap * (perRow - 1)) / perRow;
  const chipH = o.stock ? 9 : 6;
  const maxChipRows = o.sizes ? Math.max(0, ...products.map((p) => Math.ceil(p.variants.length / perRow))) : 0;
  const chipBlock = maxChipRows ? maxChipRows * (chipH + chipGap) + 1 : 0;
  const ch = (o.photos ? ih + 4 : 5) + 10 + (o.prices ? 4.5 : o.stock ? 4 : 0) + chipBlock + 2;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const head = () => {
    pdf.setFillColor(15, 23, 42); pdf.rect(0, 0, W, 22, 'F'); pdf.setFillColor(37, 99, 235); pdf.rect(0, 22, W, 1.2, 'F');
    pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
    pdf.text(shopName || 'Product Catalog', M, 11);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(`Product Catalog · ${today}${subtitle ? ` · ${subtitle}` : ''} · ${products.length} items`, M, 17);
    pdf.setTextColor(0);
    return 28;
  };
  let y = head();
  let col = 0;
  let lastCat = null;

  const sectionTitle = (cat) => {
    if (y + 14 + ch > H - M) { pdf.addPage(); y = head(); }
    pdf.setFillColor(241, 245, 249); pdf.rect(M, y, W - 2 * M, 7, 'F');
    pdf.setFillColor(37, 99, 235); pdf.rect(M, y, 1.5, 7, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(15, 23, 42);
    pdf.text((cat || 'Other').toUpperCase(), M + 4, y + 4.9);
    y += 11;
  };

  for (const p of products) {
    if (o.byCategory && p.category !== lastCat) {
      if (col !== 0) { y += ch + gap; col = 0; }
      sectionTitle(p.category);
      lastCat = p.category;
    }
    if (col === 0 && y + ch > H - M) { pdf.addPage(); y = head(); if (o.byCategory) sectionTitle(p.category); }
    const x = M + col * (cw + gap);

    pdf.setDrawColor(226, 232, 240); pdf.setFillColor(255); pdf.roundedRect(x, y, cw, ch, 2, 2, 'FD');
    let img = null;
    if (o.photos && p.img) { try { img = await getImage(p.img); } catch { img = null; } }
    let drawn = false;
    if (o.photos) {
      if (img) { try { pdf.addImage(img, 'JPEG', x + 1.5, y + 1.5, cw - 3, ih - 3); drawn = true; } catch { drawn = false; } }
      if (!drawn) {
        pdf.setFillColor(241, 245, 249); pdf.rect(x + 1.5, y + 1.5, cw - 3, ih - 3, 'F');
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(150);
        pdf.text('No photo', x + cw / 2, y + ih / 2, { align: 'center' });
      }


    }
    let ty = y + (o.photos ? ih + 4 : 6);
    pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const nameLines = pdf.splitTextToSize(p.name, cw - 4).slice(0, 2);
    pdf.text(nameLines, x + 2, ty);
    ty += nameLines.length * 4 + 2;

    if (o.prices) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(30, 64, 175);
      pdf.text(p.min === p.max ? rs(p.min) : `${rs(p.min)} - ${rs(p.max)}`, x + 2, ty);
      ty += 4.5;
    }

    if (o.stock && p.stock != null) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
      pdf.setTextColor(p.stock <= 0 ? 185 : 100, p.stock <= 0 ? 28 : 116, p.stock <= 0 ? 28 : 139);
      pdf.text(p.stock <= 0 ? 'Out of stock' : `${p.stock} in stock`, x + cw - 2, o.prices ? ty - 4.5 : ty, { align: 'right' });
      if (!o.prices) ty += 4;
    }

    if (o.sizes && p.variants.length) {
      p.variants.forEach((v, k) => {
        const cx = x + 2 + (k % perRow) * (chipW + chipGap);
        const cy = ty + Math.floor(k / perRow) * (chipH + chipGap);
        if (v.out && o.stock) { pdf.setFillColor(241, 245, 249); pdf.setDrawColor(226, 232, 240); }
        else { pdf.setFillColor(239, 246, 255); pdf.setDrawColor(191, 219, 254); }
        pdf.roundedRect(cx, cy, chipW, chipH, 1, 1, 'FD');
        const dim = v.out && o.stock;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        pdf.setTextColor(dim ? 160 : 15, dim ? 170 : 23, dim ? 180 : 42);
        pdf.text(String(v.label), cx + chipW / 2, cy + (o.stock ? 3.9 : 4.2), { align: 'center' });
        if (o.stock) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
          if (v.qty == null) pdf.setTextColor(120);
          else if (v.qty === 0) pdf.setTextColor(185, 28, 28);
          else pdf.setTextColor(21, 128, 61);
          pdf.text(v.qty == null ? '-' : String(v.qty), cx + chipW / 2, cy + 7.4, { align: 'center' });
        }
      });
    }

    col += 1;
    if (col === cols) { col = 0; y += ch + gap; }
  }

  const pages = pdf.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    pdf.setPage(n); pdf.setFontSize(8); pdf.setTextColor(130);
    pdf.text(`Page ${n} of ${pages}`, W - M, H - 5, { align: 'right' });
  }
  return pdf.output('blob');
}
