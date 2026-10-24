import { rs } from './reportExport';

/** One entry per product: sizes/variants of the same product are folded into a single card. */
export function groupCatalog(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = it.groupId || it.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  });
  return [...map.values()].map((list) => {
    const first = list[0];
    const prices = list.map((i) => Number(i.lastUsedPrice) || 0);
    const tracked = list.filter((i) => i.stockCount != null);
    return {
      name: first.groupId ? (first.baseName || first.name) : first.name,
      category: (first.category || '').trim(),
      img: list.find((i) => i.hasImage) || null,
      min: Math.min(...prices),
      max: Math.max(...prices),
      unit: first.unit,
      variants: first.groupId
        ? list.map((i) => ({ label: Object.values(i.options || {}).join(' / ') || i.name, out: i.stockCount != null && i.stockCount <= 0 }))
        : [],
      stock: tracked.length ? tracked.reduce((a, i) => a + Math.max(0, i.stockCount), 0) : null,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * Product catalog PDF: sections by category, 3 cards per row with photo, name, price
 * (range when sizes differ), available sizes and stock. Cost price is never printed.
 */
export async function buildCatalogPdf({ shopName, items, getImage, subtitle = '' }) {
  const { jsPDF } = await import('jspdf');
  const products = groupCatalog(items);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const cols = 3;
  const gap = 5;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols;
  const ih = cw * 0.9;
  const ch = ih + 25;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const head = () => {
    pdf.setFillColor(15, 23, 42); pdf.rect(0, 0, W, 22, 'F');
    pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
    pdf.text(shopName || 'Product Catalog', M, 11);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(`Product Catalog · ${today}${subtitle ? ` · ${subtitle}` : ''} · ${products.length} products`, M, 17);
    pdf.setTextColor(0);
    return 28;
  };
  let y = head();
  let col = 0;
  let lastCat = null;

  const sectionTitle = (cat) => {
    if (y + 14 + ch > H - M) { pdf.addPage(); y = head(); }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42);
    pdf.text(cat || 'Other', M, y + 4);
    pdf.setDrawColor(200); pdf.line(M, y + 6, W - M, y + 6);
    y += 10;
  };

  for (const p of products) {
    if (p.category !== lastCat) {
      if (col !== 0) { y += ch + gap; col = 0; }
      sectionTitle(p.category);
      lastCat = p.category;
    }
    if (col === 0 && y + ch > H - M) { pdf.addPage(); y = head(); sectionTitle(p.category); }
    const x = M + col * (cw + gap);

    pdf.setDrawColor(226, 232, 240); pdf.setFillColor(255); pdf.roundedRect(x, y, cw, ch, 2, 2, 'FD');
    let img = null;
    if (p.img) { try { img = await getImage(p.img); } catch { img = null; } }
    let drawn = false;
    if (img) { try { pdf.addImage(img, 'JPEG', x + 1.5, y + 1.5, cw - 3, ih - 3); drawn = true; } catch { drawn = false; } }
    if (!drawn) {
      pdf.setFillColor(241, 245, 249); pdf.rect(x + 1.5, y + 1.5, cw - 3, ih - 3, 'F');
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(150);
      pdf.text('No photo', x + cw / 2, y + ih / 2, { align: 'center' });
    }

    let ty = y + ih + 4;
    pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const nameLines = pdf.splitTextToSize(p.name, cw - 4).slice(0, 2);
    pdf.text(nameLines, x + 2, ty);
    ty += nameLines.length * 4 + 1;

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(30, 64, 175);
    pdf.text(p.min === p.max ? rs(p.min) : `${rs(p.min)} - ${rs(p.max)}`, x + 2, ty);
    ty += 4;

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    if (p.variants.length) {
      const avail = p.variants.filter((v) => !v.out).map((v) => v.label);
      const txt = avail.length ? `Available: ${avail.join(', ')}` : 'All sizes out of stock';
      pdf.setTextColor(avail.length ? 71 : 200, avail.length ? 85 : 30, avail.length ? 105 : 30);
      pdf.text(pdf.splitTextToSize(txt, cw - 4).slice(0, 2), x + 2, ty);
    } else if (p.stock != null) {
      pdf.setTextColor(p.stock <= 0 ? 200 : 71, p.stock <= 0 ? 30 : 85, p.stock <= 0 ? 30 : 105);
      pdf.text(p.stock <= 0 ? 'Out of stock' : `In stock: ${p.stock} ${p.unit || ''}`.trim(), x + 2, ty);
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
