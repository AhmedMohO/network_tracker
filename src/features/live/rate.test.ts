import { rateBetween, type Counters } from "./rate";

const at = (over: Partial<Counters> = {}): Counters => ({
  mobileRx: 0,
  mobileTx: 0,
  totalRx: 0,
  totalTx: 0,
  ...over,
});

describe("rateBetween", () => {
  it("converts a byte delta over an interval into bytes per second", () => {
    const s = rateBetween(at(), at({ totalRx: 2_000_000 }), 2000);
    expect(s!.down).toBe(1_000_000);
  });

  it("reports upload from the transmit counter", () => {
    const s = rateBetween(at(), at({ totalTx: 500 }), 1000);
    expect(s!.up).toBe(500);
  });

  it("returns null when the counters reset, rather than a negative rate", () => {
    // TrafficStats counters restart at boot.
    expect(rateBetween(at({ totalRx: 5000 }), at({ totalRx: 10 }), 1000)).toBeNull();
  });

  it("returns null when a counter is unsupported", () => {
    // TrafficStats returns -1 when the value is unavailable.
    expect(rateBetween(at(), at({ totalRx: -1 }), 1000)).toBeNull();
  });

  it("returns null for a zero or negative interval", () => {
    expect(rateBetween(at(), at({ totalRx: 100 }), 0)).toBeNull();
  });

  it("rejects a reading above any physical link speed", () => {
    // Phase 0 Q5 saw a ~1.1 GB/s jump on an idle device: a bad counter read,
    // not traffic. One of those on screen would be worse than no reading.
    expect(rateBetween(at(), at({ totalRx: 2_000_000_000 }), 1000)).toBeNull();
  });

  it("ignores the mobile counters entirely", () => {
    // Phase 0 Q5: TrafficStats mobile counters are untrustworthy on device.
    const s = rateBetween(at({ mobileRx: 9e9 }), at({ mobileRx: 0, totalRx: 100 }), 1000);
    expect(s).toEqual({ down: 100, up: 0 });
  });
});
