import { mergeSlices, sliceApp, type WifiNetworkSlice } from "./wifiSlices";

function app(uid: number, download: number, upload: number) {
  return {
    uid,
    name: `app${uid}`,
    packageName: `com.app${uid}`,
    download,
    upload,
    total: download + upload,
    foreground: 0,
    background: 0,
    percentage: 0,
  };
}

function slice(ssid: string | null, apps: ReturnType<typeof app>[]): WifiNetworkSlice {
  return {
    ssid,
    apps,
    totals: apps.reduce(
      (acc, a) => ({
        download: acc.download + a.download,
        upload: acc.upload + a.upload,
        total: acc.total + a.total,
      }),
      { download: 0, upload: 0, total: 0 }
    ),
  };
}

describe("mergeSlices", () => {
  it("sums the same network from both sources", () => {
    const merged = mergeSlices(
      [slice("Home", [app(1, 100, 10)])],
      [slice("Home", [app(1, 50, 5)])]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].ssid).toBe("Home");
    expect(merged[0].totals).toEqual({ download: 150, upload: 15, total: 165 });
    expect(merged[0].apps[0].total).toBe(165);
  });

  it("keeps distinct networks apart and orders by usage", () => {
    const merged = mergeSlices(
      [slice("Home", [app(1, 10, 0)])],
      [slice("Office", [app(2, 900, 0)])]
    );
    expect(merged.map((n) => n.ssid)).toEqual(["Office", "Home"]);
  });

  it("treats the unattributed bucket as its own network, not as a name", () => {
    const merged = mergeSlices(
      [slice(null, [app(1, 100, 0)])],
      [slice("Home", [app(1, 100, 0)])]
    );
    expect(merged).toHaveLength(2);
    expect(merged.some((n) => n.ssid === null)).toBe(true);
  });

  it("keeps totals from a slice that carries no app rows (a synced child)", () => {
    // `wifiNetworksFromPayload` produces exactly this shape: totals, no apps.
    const merged = mergeSlices(
      [{ ssid: "Home", apps: [], totals: { download: 400, upload: 100, total: 500 } }],
      [{ ssid: "Home", apps: [], totals: { download: 200, upload: 0, total: 200 } }]
    );
    expect(merged[0].totals.total).toBe(700);
  });

  it("recomputes percentages against the merged per-network total", () => {
    const merged = mergeSlices(
      [slice("Home", [app(1, 75, 0), app(2, 25, 0)])],
      []
    );
    expect(merged[0].apps.map((a) => a.percentage)).toEqual([75, 25]);
  });

  it("does not mutate the caller's rows", () => {
    const source = slice("Home", [app(1, 100, 0)]);
    mergeSlices([source], [slice("Home", [app(1, 100, 0)])]);
    expect(source.apps[0].total).toBe(100);
  });
});

describe("sliceApp", () => {
  it("reports one app's bytes per network, busiest first, skipping zeroes", () => {
    const networks = [
      slice("Home", [app(1, 10, 0), app(2, 999, 0)]),
      slice("Office", [app(1, 400, 100)]),
      // Network the app never touched: must not appear at all, even though
      // the network itself carried plenty of traffic.
      slice("Cafe", [app(2, 1, 0)]),
    ];
    expect(sliceApp(networks, 1)).toEqual([
      { ssid: "Office", apps: [], totals: { download: 400, upload: 100, total: 500 } },
      { ssid: "Home", apps: [], totals: { download: 10, upload: 0, total: 10 } },
    ]);
  });
});
