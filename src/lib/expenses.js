/** An expense that has not left the drawer or bank yet: not paid, or paid from a staff member's own pocket. */
export const isPending = (e) => e?.paidVia === 'unpaid' || e?.paidVia === 'staff';
