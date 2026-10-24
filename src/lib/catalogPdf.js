import { rs } from './reportExport';

/**
 * Product catalog as a PDF: 3 cards per row with photo, name, price and stock.
 * items: catalog docs; getImage(item) -> Promise<dataUrl|null>. Cost price is never printed.
 */
export async function buildCatalogPdf({ shopName, items, getImage, subtitle = '' }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const cols = 3;
  const gap = 5;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols;
  const ih = cw; // square photo
  const ch = ih + 17;

  const head = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(0);
    pdf.text(`${shopName || 'Shop'} - Product Catalog`, M, M + 4);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100);
    pdf.text(`${subtitle ? `${subtitle} · ` : ''}${items.length} products`, M, M + 9);
    return M + 15;
  };
  let y = head();

  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    if (col === 0 && i > 0) y += ch + gap;
    if (y + ch > H - M) { pdf.addPage(); y = head(); }
    const x = M + col * (cw + gap);
    const it = items[i];

    pdf.setDrawColor(220); pdf.roundedRect(x, y, cw, ch, 2, 2);
    let img = null;
    if (it.hasImage) { try { img = await getImage(it); } catch { img = null; } }
    if (img) {
      try { pdf.addImage(img, 'JPEG', x + 1, y + 1, cw - 2, ih - 2); } catch { img = null; }
    }
    if (!img) {
      pdf.setFillColor(241, 245, 249); pdf.rect(x + 1, y + 1, cw - 2, ih - 2, 'F');
      pdf.setFontSize(8); pdf.setTextColor(150); pdf.text('No photo', x + cw / 2, y + ih / 2, { align: 'center' });
    }
    pdf.setTextColor(0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(String(it.name || ''), cw - 4).slice(0, 2);
    pdf.text(lines, x + 2, y + ih + 4.5);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(30, 64, 175);
    pdf.text(rs(it.lastUsedPrice), x + 2, y + ch - 2.5);
    if (it.stockCount != null) {
      pdf.setTextColor(it.stockCount <= 0 ? 200 : 90, it.stockCount <= 0 ? 30 : 90, it.stockCount <= 0 ? 30 : 90);
      pdf.text(it.stockCount <= 0 ? 'Out of stock' : `${it.stockCount} ${it.unit || ''}`.trim(), x + cw - 2, y + ch - 2.5, { align: 'right' });
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(130);
    pdf.text(`Ledgro • page ${p}/${pages}`, W - M, H - 5, { align: 'right' });
  }
  return pdf.output('blob');
}
