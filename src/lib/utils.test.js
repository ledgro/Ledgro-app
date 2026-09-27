import { describe, it, expect } from 'vitest';
import { formatCurrency } from './utils';

describe('formatCurrency', () => {
  it('formats standard integer amounts in INR', () => {
    expect(formatCurrency(100000)).toBe('₹1,000');
    expect(formatCurrency(10000000)).toBe('₹1,00,000');
  });

  it('formats decimal values up to 2 places', () => {
    expect(formatCurrency(123450)).toBe('₹1,234.5');
    expect(formatCurrency(123456.7)).toBe('₹1,234.57');
  });

  it('gracefully handles zero, null, and undefined', () => {
    expect(formatCurrency(0)).toBe('₹0');
    expect(formatCurrency(null)).toBe('₹0');
    expect(formatCurrency(undefined)).toBe('₹0');
  });

  it('handles negative values correctly', () => {
    expect(formatCurrency(-50000)).toBe('₹-500');
  });
});
