// GST invoice serial: one running count per shop per financial year (April to March), never repeating, no gaps.
//   sale          26-27/000123
//   return        R/26-27/000045   (credit notes are their own series)
// At most 16 characters, letters, digits, "/" and "-" only, as GST invoice rules require.
// The count lives in shops/{shopId}/billCounters/{series}; firestore.rules only accept last = previous + 1,
// so two phones billing at once cannot take the same number (the second save is refused and retried).

/** Financial year of a date, in India time: { key: '2627', label: '26-27' }. */
export function fiscalYear(date) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1; // April is month 3
  const a = String(start % 100).padStart(2, '0');
  const b = String((start + 1) % 100).padStart(2, '0');
  return { key: `${a}${b}`, label: `${a}-${b}` };
}

export function formatBillNo(date, n, kind = 'S') {
  const { label } = fiscalYear(date);
  const serial = String(n).padStart(6, '0');
  return kind === 'R' ? `R/${label}/${serial}` : `${label}/${serial}`;
}

export function counterId(date, kind = 'S') {
  const { key } = fiscalYear(date);
  return kind === 'R' ? `${key}-R` : key;
}

/**
 * Takes the next number in a series. `read(ref)` must read from the server (tx.get or getDocFromServer).
 * Returns { ref, data, billNo }: the caller writes `data` to `ref` in the SAME transaction or batch as the bill.
 */
export async function reserveBillNo({ doc, db, shopId, date, kind = 'S', read }) {
  const ref = doc(db, `shops/${shopId}/billCounters`, counterId(date, kind));
  const snap = await read(ref);
  const last = snap.exists() && Number.isInteger(snap.data().last) ? snap.data().last : 0;
  const next = last + 1;
  return { ref, data: { last: next }, billNo: formatBillNo(date, next, kind) };
}
