import { describe, it, expect } from 'vitest';
import { formatCurrency } from './utils';

describe('formatCurrency', () => {
  it('formats standard integer amounts in INR', () => {
    expect(formatCurrency(1000)).toBe('₹1,000');
    expect(formatCurrency(100000)).toBe('₹1,00,000');
  });

  it('formats decimal values up to 2 places', () => {
    expect(formatCurrency(1234.5)).toBe('₹1,234.5');
    expect(formatCurrency(1234.567)).toBe('₹1,234.57');
  });

  it('gracefully handles zero, null, and undefined', () => {
    expect(formatCurrency(0)).toBe('₹0');
    expect(formatCurrency(null)).toBe('₹0');
    expect(formatCurrency(undefined)).toBe('₹0');
  });

  it('handles negative values correctly', () => {
    expect(formatCurrency(-500)).toBe('₹-500');
  });
});
