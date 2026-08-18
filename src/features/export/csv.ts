import type { NetworkFilter } from "@modules/network-usage";

import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";

const HEADER = [
  "app",
  "package",
  "uid",
  "network",
  "range_start",
  "range_end",
  "download_bytes",
  "upload_bytes",
  "total_bytes",
  "foreground_bytes",
  "background_bytes",
].join(",");

/** RFC 4180: wrap in quotes and double any embedded quote. */
function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(apps: AppUsage[], range: Range, network: NetworkFilter): string {
  const start = new Date(range.start).toISOString();
  const end = new Date(range.end).toISOString();

  const rows = apps.map((a) =>
    [
      escape(a.name),
      escape(a.packageName ?? ""),
      a.uid,
      network,
      start,
      end,
      // Raw bytes, never formatted — a spreadsheet cannot sum "1.2 GB".
      a.download,
      a.upload,
      a.total,
      a.foreground,
      a.background,
    ].join(",")
  );

  return [HEADER, ...rows].join("\n");
}

export function toJson(apps: AppUsage[], range: Range, network: NetworkFilter): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      network,
      rangeStart: new Date(range.start).toISOString(),
      rangeEnd: new Date(range.end).toISOString(),
      apps,
    },
    null,
    2
  );
}
