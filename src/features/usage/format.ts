const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  if (unit === 0) return `${Math.round(value)} B`;
  // Three-digit values do not need a decimal; 120 MB reads better than 120.4 MB.
  const decimals = value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

export function formatRate(bytesPerSecond: number): string {
  const formatted = formatBytes(bytesPerSecond);
  return formatted === "—" ? formatted : `${formatted}/s`;
}
