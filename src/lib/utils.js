import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const toPaise = (rupees) => {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const val = Number(rupees);
  if (!Number.isFinite(val)) return null;
  return Math.round(val * 100);
};

export const toRupees = (paise) => {
  if (paise === null || paise === undefined || paise === '') return 0;
  const val = Number(paise);
  if (!Number.isFinite(val)) return 0;
  return val / 100;
};

export const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '₹0';

  let val = Number(value);
  if (!Number.isFinite(val)) return '₹0';

  // Always treat the input as paise.
  const inRupees = toRupees(val);
  const absoluteRupees = Math.abs(inRupees);

  const formatted = absoluteRupees.toLocaleString('en-IN', {
    minimumFractionDigits: absoluteRupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return (inRupees < 0 ? '-' : '') + '₹' + formatted;
};

export function hapticVibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export function sanitizeText(input) {
  if (!input) return '';
  return String(input).trim().slice(0, 500); // 500 is an arbitrary generous limit to prevent crazy long string abuse
}
