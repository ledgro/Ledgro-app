import DOMPurify from 'dompurify';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const toPaise = (rupees) => Math.round(parseFloat(rupees || 0) * 100);

export const toRupees = (paise) => (paise || 0) / 100;

export const formatCurrency = (value) => {
  // Backwards compatibility check: If the value is suspiciously small and has decimals,
  // or if it was fetched from an older unmigrated document, it might already be in rupees.
  // The new standard is strictly integers (paise). We assume any float passed here is legacy rupees.
  // Also checking if value is less than 1000000 but larger than 0, it might be in rupees for historical data
  // Since we can't reliably detect this purely dynamically without an explicit flag, we'll try to infer
  // For safety and per code review, if value is a float, it's rupees. Otherwise it's paise.
  let inRupees = 0;
  if (value != null) {
    // If it has decimals, it's definitely rupees.
    // If it's an integer but it's an old record, it might be an exact integer rupee value.
    // However, the cleanest fallback is to just treat all integers as Paise per the new architecture.
    // To solve the historical data bug specifically for integer rupees (like ₹1000 stored as 1000),
    // a backend migration script is truly required. For now, we will handle decimals gracefully.
    if (value % 1 !== 0) {
       inRupees = value; // Legacy float (Rupees)
    } else {
       // Since the new app sends paise (e.g. 100000 for ₹1000),
       // old integer rupees (e.g. 1000 for ₹1000) will show as ₹10.
       // This is a known caveat of the migration without a backend script.
       inRupees = value / 100; // New standard (Paise)
    }
  }

  return '₹' + (inRupees).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export function hapticVibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // pattern can be a number (ms) or array of numbers
    navigator.vibrate(pattern);
  }
}

export function sanitizeText(input) {
  if (!input) return '';
  return DOMPurify.sanitize(String(input), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
}
