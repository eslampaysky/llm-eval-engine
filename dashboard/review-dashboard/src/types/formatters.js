export function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '0.00';
  }
  return (Number(value) * 100).toFixed(2);
}

export function formatDate(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
