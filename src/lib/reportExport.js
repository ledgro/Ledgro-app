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

/** columns: [{ label, w (relative width), align?: 'right', max?: chars }] ; rows: string[][] */
export async function buildReportPdf({ title, subtitle, columns, rows, summary = [] }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const totalW = columns.reduce((a, c) => a + c.w, 0);
  const colW = columns.map((c) => ((W - 2 * M) * c.w) / totalW);

  let y = M + 4;
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.text(title, M, y);
  y += 6;
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100);
  if (subtitle) { pdf.text(subtitle, M, y); y += 5; }
  summary.forEach((s) => { pdf.text(s, M, y); y += 4.5; });
  pdf.setTextColor(0);
  y += 2;

  const header = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    let x = M;
    columns.forEach((c, i) => {
      pdf.text(c.label, c.align === 'right' ? x + colW[i] - 1 : x + 1, y, c.align === 'right' ? { align: 'right' } : undefined);
      x += colW[i];
    });
    pdf.setDrawColor(150); pdf.line(M, y + 1.5, W - M, y + 1.5);
    y += 6;
    pdf.setFont('helvetica', 'normal');
  };
  header();

  rows.forEach((r) => {
    if (y > H - M) { pdf.addPage(); y = M + 4; header(); }
    let x = M;
    r.forEach((cell, i) => {
      const c = columns[i];
      const txt = clip(cell, c.max || 40);
      pdf.text(txt, c.align === 'right' ? x + colW[i] - 1 : x + 1, y, c.align === 'right' ? { align: 'right' } : undefined);
      x += colW[i];
    });
    y += 5;
  });

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(130);
    pdf.text(`Ledgro • page ${p}/${pages}`, W - M, H - 5, { align: 'right' });
  }
  return pdf.output('blob');
}

export const buildReport = (_format, spec) => buildReportPdf(spec);
