// Table report -> PDF or PNG. No CSV. Pure client-side, no html2canvas needed.
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

export const PNG_MAX_ROWS = 250;

export async function buildReportPng({ title, subtitle, columns, rows, summary = [] }) {
  const shown = rows.slice(0, PNG_MAX_ROWS);
  const scale = 2, width = 1100, pad = 24, rowH = 26;
  const headH = 60 + summary.length * 20 + (subtitle ? 22 : 0);
  const height = headH + 36 + (shown.length + (rows.length > shown.length ? 1 : 0)) * rowH + pad;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px sans-serif'; ctx.textBaseline = 'top';
  ctx.fillText(title, pad, pad);
  let y = pad + 32;
  ctx.fillStyle = '#64748b'; ctx.font = '13px sans-serif';
  if (subtitle) { ctx.fillText(subtitle, pad, y); y += 22; }
  summary.forEach((s) => { ctx.fillText(s, pad, y); y += 20; });
  y += 8;

  const totalW = columns.reduce((a, c) => a + c.w, 0);
  const colW = columns.map((c) => ((width - 2 * pad) * c.w) / totalW);
  const drawRow = (cells, bold) => {
    ctx.font = `${bold ? 'bold ' : ''}13px sans-serif`;
    ctx.fillStyle = bold ? '#0f172a' : '#334155';
    let x = pad;
    cells.forEach((cell, i) => {
      const c = columns[i];
      const txt = clip(cell, c.max || 40);
      ctx.textAlign = c.align === 'right' ? 'right' : 'left';
      ctx.fillText(txt, c.align === 'right' ? x + colW[i] - 6 : x + 6, y);
      x += colW[i];
    });
    ctx.textAlign = 'left';
    y += rowH;
  };
  drawRow(columns.map((c) => c.label), true);
  ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(pad, y - 6); ctx.lineTo(width - pad, y - 6); ctx.stroke();
  shown.forEach((r, i) => {
    if (i % 2) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(pad, y - 4, width - 2 * pad, rowH); }
    drawRow(r, false);
  });
  if (rows.length > shown.length) {
    ctx.fillStyle = '#94a3b8'; ctx.font = 'italic 12px sans-serif';
    ctx.fillText(`… ${rows.length - shown.length} more rows. Use PDF for the full list.`, pad + 6, y);
  }
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  canvas.width = 0; canvas.height = 0;
  return blob;
}

export const buildReport = (format, spec) => (format === 'png' ? buildReportPng(spec) : buildReportPdf(spec));
