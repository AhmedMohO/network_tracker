import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";

import { toCsv, toJson } from "./csv";

const range: Range = {
  start: 1_700_000_000_000,
  end: 1_700_086_400_000,
  preset: "today",
};

const app = (over: Partial<AppUsage> = {}): AppUsage => ({
  uid: 10001,
  name: "Example",
  packageName: "com.example",
  download: 1000,
  upload: 100,
  total: 1100,
  foreground: 700,
  background: 400,
  percentage: 100,
  ...over,
});

describe("toCsv", () => {
  it("starts with a header row", () => {
    expect(toCsv([app()], range, "MOBILE").split("\n")[0]).toBe(
      "app,package,uid,network,range_start,range_end,download_bytes,upload_bytes,total_bytes,foreground_bytes,background_bytes"
    );
  });

  it("writes raw byte counts, not formatted sizes", () => {
    const row = toCsv([app()], range, "MOBILE").split("\n")[1];
    expect(row).toContain(",1000,100,1100,");
    expect(row).not.toContain("KB");
  });

  it("quotes and escapes a name containing a comma or quote", () => {
    const row = toCsv([app({ name: 'Bob"s, App' })], range, "MOBILE").split("\n")[1];
    expect(row.startsWith('"Bob""s, App",')).toBe(true);
  });

  it("quotes a name that would otherwise break the row in two", () => {
    const row = toCsv([app({ name: "Two\nLines" })], range, "MOBILE").slice(
      toCsv([], range, "MOBILE").length + 1
    );
    expect(row.startsWith('"Two\nLines",')).toBe(true);
  });

  it("emits ISO timestamps so the range is unambiguous", () => {
    expect(toCsv([app()], range, "MOBILE")).toContain(new Date(range.start).toISOString());
  });

  it("returns just the header for no apps", () => {
    expect(toCsv([], range, "MOBILE").split("\n")).toHaveLength(1);
  });
});

describe("toJson", () => {
  it("wraps the rows with the query that produced them", () => {
    const parsed = JSON.parse(toJson([app()], range, "WIFI"));
    expect(parsed.network).toBe("WIFI");
    expect(parsed.rangeStart).toBe(new Date(range.start).toISOString());
    expect(parsed.apps).toHaveLength(1);
  });
});
