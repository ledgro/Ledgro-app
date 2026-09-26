import DOMPurify from 'dompurify';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount) {
  return '₹' + (amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

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
