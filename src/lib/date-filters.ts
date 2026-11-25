export type DateFilterPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'this_month'
  | 'last_month'
  | 'last30'
  | 'custom';

export interface DateRange {
  fromDate: string;
  toDate: string;
}

export const DATE_FILTER_PRESETS: ReadonlyArray<{
  id: Exclude<DateFilterPreset, 'custom'>;
  label: string;
}> = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last30', label: 'Last 30 Days' },
];

/**
 * Formats a Date into YYYY-MM-DD using the local calendar date.
 */
export function formatLocalDateISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolves inclusive YYYY-MM-DD bounds for a named date filter preset.
 */
export function getDateRangeForPreset(
  preset: Exclude<DateFilterPreset, 'custom'>,
  baseDate: Date = new Date()
): DateRange {
  const todayStr = formatLocalDateISO(baseDate);

  switch (preset) {
    case 'all':
      return { fromDate: '', toDate: '' };
    case 'today':
      return { fromDate: todayStr, toDate: todayStr };
    case 'yesterday': {
      const yesterday = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() - 1
      );
      const yesterdayStr = formatLocalDateISO(yesterday);
      return { fromDate: yesterdayStr, toDate: yesterdayStr };
    }
    case 'last7': {
      const past = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() - 7
      );
      return { fromDate: formatLocalDateISO(past), toDate: todayStr };
    }
    case 'last30': {
      const past = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() - 30
      );
      return { fromDate: formatLocalDateISO(past), toDate: todayStr };
    }
    case 'this_month': {
      const firstOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      return { fromDate: formatLocalDateISO(firstOfMonth), toDate: todayStr };
    }
    case 'last_month': {
      const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
      const end = new Date(baseDate.getFullYear(), baseDate.getMonth(), 0);
      return {
        fromDate: formatLocalDateISO(start),
        toDate: formatLocalDateISO(end),
      };
    }
  }
}

/**
 * Checks whether a YYYY-MM-DD (or ISO) date string falls within optional inclusive bounds.
 */
export function isDateInRange(
  dateStr: string,
  fromDate?: string,
  toDate?: string
): boolean {
  const clean = dateStr.split('T')[0].trim();
  if (!clean) return false;
  if (fromDate && clean < fromDate) return false;
  if (toDate && clean > toDate) return false;
  return true;
}
