import { describe, it, expect } from 'vitest';
import { formatNumber, formatExpense, formatDate, formatINR } from './format';

describe('Format Utility Functions', () => {
  describe('formatINR', () => {
    it('formats positive numbers with ₹ and 2 decimal places', () => {
      expect(formatINR(0)).toBe('₹0.00');
      expect(formatINR(100)).toBe('₹100.00');
      expect(formatINR(2350.5)).toBe('₹2,350.50');
      expect(formatINR(100000)).toBe('₹1,00,000.00');
      expect(formatINR(10000000)).toBe('₹1,00,00,000.00');
    });

    it('formats negative numbers with leading minus sign', () => {
      expect(formatINR(-150)).toBe('-₹150.00');
      expect(formatINR(-2350.75)).toBe('-₹2,350.75');
    });

    it('handles numeric strings and invalid/null inputs gracefully', () => {
      expect(formatINR('1234.5')).toBe('₹1,234.50');
      expect(formatINR('-50.2')).toBe('-₹50.20');
      expect(formatINR(null)).toBe('₹0.00');
      expect(formatINR(undefined)).toBe('₹0.00');
      expect(formatINR('')).toBe('₹0.00');
      expect(formatINR('abc')).toBe('₹0.00');
    });
  });

  describe('formatNumber and formatExpense', () => {
    it('formats numbers with standard decimal places', () => {
      expect(formatNumber(1234.5)).toBe('1,234.50');
      expect(formatExpense(350.875)).toBe('350.875');
    });
  });

  describe('formatDate', () => {
    it('formats dates into dd-mm-yy', () => {
      expect(formatDate('2026-11-26')).toBe('26-11-26');
      expect(formatDate(null)).toBe('—');
    });
  });
});
