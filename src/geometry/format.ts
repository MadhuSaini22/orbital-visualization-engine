export function formatNumber(value: number | undefined, digits = 2) {
  if (value === undefined || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatUtc(date: Date) {
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}
