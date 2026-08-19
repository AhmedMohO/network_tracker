import { isContextStale, resolveForegroundAppName } from "./context";

const FORTY_FIVE_MIN = 45 * 60 * 1000;

describe("isContextStale", () => {
  it("is not stale exactly at the 45-minute boundary", () => {
    expect(isContextStale(1000, 1000 + FORTY_FIVE_MIN)).toBe(false);
  });

  it("is stale one millisecond past the boundary", () => {
    expect(isContextStale(1000, 1000 + FORTY_FIVE_MIN + 1)).toBe(true);
  });

  it("is not stale for a check-in seconds ago", () => {
    expect(isContextStale(1000, 1500)).toBe(false);
  });

  it("defaults 'now' to the real clock when not supplied", () => {
    expect(isContextStale(Date.now() - 1000)).toBe(false);
    expect(isContextStale(Date.now() - FORTY_FIVE_MIN - 60_000)).toBe(true);
  });
});

describe("resolveForegroundAppName", () => {
  const apps = [
    { pkg: "com.youtube", name: "YouTube" },
    { pkg: "com.chrome", name: "Chrome" },
  ];

  it("returns null when there is no foreground package", () => {
    expect(resolveForegroundAppName(null, apps)).toBeNull();
  });

  it("resolves a known package to the name carried in the heartbeat's own app list", () => {
    expect(resolveForegroundAppName("com.youtube", apps)).toBe("YouTube");
  });

  it("falls back to the raw package name when it is not in the app list", () => {
    // The parent's device may not have this app installed to resolve an icon
    // for it either, but the raw package name still says something honest.
    expect(resolveForegroundAppName("com.unknown.app", apps)).toBe("com.unknown.app");
  });

  it("falls back to the raw package name against an empty app list", () => {
    expect(resolveForegroundAppName("com.x", [])).toBe("com.x");
  });
});
