import { fromPayload } from "./fromPayload";

const payload = {
  apps: [
    { uid: 1, name: "YouTube", pkg: "com.google.android.youtube", dl: 900, ul: 100 },
    { uid: 2, name: "Chrome", pkg: "com.android.chrome", dl: 300, ul: 0 },
  ],
  otherBytes: 200,
};

describe("fromPayload", () => {
  it("restores the AppUsage shape the existing components take", () => {
    const [first] = fromPayload(payload);
    expect(first.name).toBe("YouTube");
    expect(first.download).toBe(900);
    expect(first.total).toBe(1000);
  });

  it("computes percentages against the true total, trimmed apps included", () => {
    // 1000 + 300 + 200 = 1500. Ignoring otherBytes would inflate every row.
    expect(fromPayload(payload)[0].percentage).toBeCloseTo(1000 / 1500 * 100);
  });

  it("surfaces the trimmed tail as a row rather than hiding it", () => {
    const rows = fromPayload(payload);
    expect(rows.at(-1)?.total).toBe(200);
  });

  it("adds no tail row when nothing was trimmed", () => {
    expect(fromPayload({ apps: payload.apps, otherBytes: 0 })).toHaveLength(2);
  });

  it("reports no foreground/background split rather than inventing one", () => {
    // Same reason `readArchive` returns zeros: the payload does not carry it.
    expect(fromPayload(payload)[0].foreground).toBe(0);
  });

  it("survives a payload from an older or malformed push", () => {
    expect(fromPayload({} as any)).toEqual([]);
    expect(fromPayload({ apps: null } as any)).toEqual([]);
  });
});
