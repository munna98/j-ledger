export function formatNumber(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into dd-mm-yy format.
 * Example: "2026-11-10" -> "10-11-26"
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.trim() === '') return '—';
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    if (yyyy.length === 4) {
      const yy = yyyy.slice(-2);
      return `${dd.padStart(2, '0')}-${mm.padStart(2, '0')}-${yy}`;
    }
    if (dd.length === 4) {
      return `${yyyy.padStart(2, '0')}-${mm.padStart(2, '0')}-${dd.slice(-2)}`;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}
