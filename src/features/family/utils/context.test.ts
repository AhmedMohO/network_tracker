import { checkInAt, connectionKey, isContextStale, resolveForegroundAppName } from "./context";

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

describe("checkInAt", () => {
  it("falls back to the child's own claim when there is no server stamp", () => {
    expect(checkInAt(1000, null)).toBe(1000);
  });

  it("prefers the server stamp when the child's clock runs fast", () => {
    // The child claims a check-in 20 minutes in the future; the server saw the
    // push land at 1000. Trusting the child would keep this "fresh" for 65
    // minutes instead of 45.
    expect(checkInAt(1000 + 20 * 60_000, 1000)).toBe(1000);
  });

  it("keeps the child's own claim when it is already the older of the two", () => {
    // A slow child clock understates freshness, which is the safe direction.
    expect(checkInAt(1000, 1000 + 20 * 60_000)).toBe(1000);
  });

  it("makes a fast-clocked child go stale on real elapsed time, not its own", () => {
    const serverAt = 0;
    const childAt = 20 * 60_000;
    const now = 60 * 60_000; // an hour after the push actually landed
    // On the child's clock alone this is 40 minutes old and would still name
    // an app; on the server's stamp it is an hour and names the gap instead.
    expect(isContextStale(childAt, now)).toBe(false);
    expect(isContextStale(checkInAt(childAt, serverAt), now)).toBe(true);
  });

  it("never reports a check-in in the future of the server stamp", () => {
    const now = 5000;
    expect(now - checkInAt(now + 60_000, now - 1000)).toBeGreaterThan(0);
  });
});

describe("connectionKey", () => {
  it("names mobile data and Wi-Fi", () => {
    expect(connectionKey("MOBILE")).toBe("family.contextOnMobile");
    expect(connectionKey("WIFI")).toBe("family.contextOnWifi");
  });

  it("routes an absent network to the same key as an unknown transport", () => {
    // Ethernet and Bluetooth tethering arrive as "NONE" from `LiveProbe`, so
    // this key's copy must not say "offline" — see the doc comment.
    expect(connectionKey("NONE")).toBe("family.contextOffline");
  });

  it("never returns undefined for a value this build does not know", () => {
    for (const v of ["ETHERNET", "", null, undefined]) {
      expect(connectionKey(v)).toBe("family.contextOffline");
    }
  });
});
