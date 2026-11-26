import { describe, it, expect } from 'vitest';
import {
  formatLocalDateISO,
  getDateRangeForPreset,
  isDateInRange,
} from './date-filters';

describe('Date Filter Helpers', () => {
  const baseDate = new Date(2026, 10, 25, 14, 10, 0); // 2026-11-25 local time

  it('formats local calendar dates as YYYY-MM-DD', () => {
    expect(formatLocalDateISO(baseDate)).toBe('2026-11-25');
    expect(formatLocalDateISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns empty bounds for all preset', () => {
    expect(getDateRangeForPreset('all', baseDate)).toEqual({
      fromDate: '',
      toDate: '',
    });
  });

  it('returns single-day bounds for today and yesterday presets', () => {
    expect(getDateRangeForPreset('today', baseDate)).toEqual({
      fromDate: '2026-11-25',
      toDate: '2026-11-25',
    });
    expect(getDateRangeForPreset('yesterday', baseDate)).toEqual({
      fromDate: '2026-11-24',
      toDate: '2026-11-24',
    });
  });

  it('computes last2 bounds correctly', () => {
    expect(getDateRangeForPreset('last2', baseDate)).toEqual({
      fromDate: '2026-11-23',
      toDate: '2026-11-25',
    });
  });

  it('handles month and year rollover for yesterday and last_month', () => {
    const janFirst = new Date(2026, 0, 1);
    expect(getDateRangeForPreset('yesterday', janFirst)).toEqual({
      fromDate: '2025-12-31',
      toDate: '2025-12-31',
    });
    expect(getDateRangeForPreset('last_month', janFirst)).toEqual({
      fromDate: '2025-12-01',
      toDate: '2025-12-31',
    });

    const marchFirstLeap = new Date(2024, 2, 1);
    expect(getDateRangeForPreset('last_month', marchFirstLeap)).toEqual({
      fromDate: '2024-02-01',
      toDate: '2024-02-29',
    });
  });

  it('computes last7, last30, and this_month bounds consistently', () => {
    expect(getDateRangeForPreset('last7', baseDate)).toEqual({
      fromDate: '2026-11-18',
      toDate: '2026-11-25',
    });
    expect(getDateRangeForPreset('last30', baseDate)).toEqual({
      fromDate: '2026-10-26',
      toDate: '2026-11-25',
    });
    expect(getDateRangeForPreset('this_month', baseDate)).toEqual({
      fromDate: '2026-11-01',
      toDate: '2026-11-25',
    });
  });

  it('filters dates inclusively and supports open-ended or ISO timestamps', () => {
    expect(isDateInRange('2026-11-25', '2026-11-25', '2026-11-25')).toBe(true);
    expect(isDateInRange('2026-11-25T10:30:00.000Z', '2026-11-25', '2026-11-25')).toBe(true);
    expect(isDateInRange('2026-11-24', '2026-11-25', '2026-11-25')).toBe(false);
    expect(isDateInRange('2026-11-24', '', '2026-11-25')).toBe(true);
    expect(isDateInRange('2026-11-26', '2026-11-25', '')).toBe(true);
    expect(isDateInRange('2026-11-25', '2026-11-26', '2026-11-20')).toBe(false);
    expect(isDateInRange('', '', '')).toBe(false);
  });
});
