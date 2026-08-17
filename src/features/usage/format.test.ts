import { formatBytes, formatRate } from "./format";

describe("formatBytes", () => {
  it("shows bytes below 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("uses binary units", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("drops the decimal for three-digit values", () => {
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
  });

  it("never renders a negative or non-finite value as a number", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
  });
});

describe("formatRate", () => {
  it("appends a per-second suffix", () => {
    expect(formatRate(1024 * 1024)).toBe("1.0 MB/s");
  });
});
