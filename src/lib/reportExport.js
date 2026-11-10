// Table report -> PDF. No CSV, no PNG. Pure client-side, no html2canvas needed.
// jsPDF's built-in fonts have no rupee glyph, so amounts are written "Rs 1,234.50".

export const rs = (paise) => {
  const n = Number(paise);
  if (!Number.isFinite(n)) return 'Rs 0.00';
  const abs = Math.abs(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}Rs ${abs}`;
};

const clip = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const BRAND = [30, 64, 175];
const TONES = { good: [4, 120, 87], bad: [185, 28, 28], plain: INK };

/**
 * columns: [{ label, w (relative width), align?: 'right', max?: chars }]
 * rows: string[][]  or  { cells: string[], kind?: 'section' | 'total' | 'gap' }
 * kpis: [{ label, value, tone?: 'good' | 'bad' }]   big numbers shown first
 * notes: string[]   plain-language lines under the table
 */
export async function buildReportPdf({ title, subtitle, columns, rows, summary = [], kpis = [], notes = [], brand = 'Ledgro' }) {
  const { jsPDF } = await import('jspdf');
  const landscape = columns.length > 4;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 14;
  const totalW = columns.reduce((a, c) => a + c.w, 0);
  const colW = columns.map((c) => ((W - 2 * M) * c.w) / totalW);
  const ROW = 8;

  // Header band
  pdf.setFillColor(...BRAND); pdf.rect(0, 0, W, 26, 'F');
  pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18);
  pdf.text(clip(title, landscape ? 70 : 42), M, 12);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  if (subtitle) pdf.text(clip(subtitle, 80), M, 19.5);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text(brand, W - M, 12, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  pdf.text(`Made on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, W - M, 19.5, { align: 'right' });
  let y = 36;
  pdf.setTextColor(...INK);

  // Big numbers
  if (kpis.length) {
    const gap = 4;
    const cw = (W - 2 * M - gap * (kpis.length - 1)) / kpis.length;
    kpis.forEach((k, i) => {
      const x = M + i * (cw + gap);
      pdf.setFillColor(241, 245, 249); pdf.roundedRect(x, y, cw, 22, 3, 3, 'F');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED);
      pdf.text(k.label, x + 4, y + 7);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(landscape ? 15 : 13); pdf.setTextColor(...(TONES[k.tone] || INK));
      pdf.text(clip(k.value, 22), x + 4, y + 16);
    });
    y += 22 + 8;
  }
  if (summary.length) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...MUTED);
    summary.forEach((t) => { pdf.text(t, M, y); y += 5; });
    y += 3;
  }
  pdf.setTextColor(...INK);

  const header = () => {
    pdf.setFillColor(226, 232, 240); pdf.rect(M, y - 5.5, W - 2 * M, ROW, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...INK);
    let x = M;
    columns.forEach((c, i) => {
      pdf.text(c.label, c.align === 'right' ? x + colW[i] - 2 : x + 2, y, c.align === 'right' ? { align: 'right' } : undefined);
      x += colW[i];
    });
    y += ROW;
  };
  header();

  let zebra = 0;
  rows.forEach((raw) => {
    const r = Array.isArray(raw) ? { cells: raw } : raw;
    if (r.kind === 'gap') { y += 4; zebra = 0; return; }
    if (y > H - 22) { pdf.addPage(); y = 20; header(); zebra = 0; }
    const top = y - 5.5;
    if (r.kind === 'section') {
      pdf.setFillColor(219, 234, 254); pdf.rect(M, top, W - 2 * M, ROW, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...BRAND);
      pdf.text(clip(r.cells[0], 70), M + 2, y);
      y += ROW; zebra = 0; return;
    }
    if (r.kind === 'total') {
      pdf.setFillColor(241, 245, 249); pdf.rect(M, top, W - 2 * M, ROW, 'F');
      pdf.setDrawColor(148, 163, 184); pdf.line(M, top, W - M, top);
    } else if (zebra++ % 2 === 1) {
      pdf.setFillColor(248, 250, 252); pdf.rect(M, top, W - 2 * M, ROW, 'F');
    }
    pdf.setFont('helvetica', r.kind === 'total' ? 'bold' : 'normal'); pdf.setFontSize(10);
    let x = M;
    r.cells.forEach((cell, i) => {
      const c = columns[i];
      const txt = clip(cell, c.max || 40);
      const neg = c.align === 'right' && /^-\s?Rs|^-Rs/.test(txt);
      pdf.setTextColor(...(neg ? TONES.bad : INK));
      pdf.text(txt, c.align === 'right' ? x + colW[i] - 2 : x + 2, y, c.align === 'right' ? { align: 'right' } : undefined);
      x += colW[i];
    });
    pdf.setTextColor(...INK);
    y += ROW;
  });

  if (notes.length) {
    y += 6;
    if (y > H - 30) { pdf.addPage(); y = 20; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED);
    pdf.text('How to read this', M, y); y += 5;
    pdf.setFont('helvetica', 'normal');
    notes.forEach((n) => { pdf.splitTextToSize(n, W - 2 * M).forEach((ln) => { pdf.text(ln, M, y); y += 4.5; }); });
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(...MUTED);
    pdf.text(`${brand}  |  page ${p} of ${pages}`, W - M, H - 6, { align: 'right' });
  }
  return pdf.output('blob');
}

export const buildReport = (_format, spec) => buildReportPdf(spec);
