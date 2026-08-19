import {
  decideAlert,
  decideQuietChild,
  isStale,
  limitAlertKey,
  spikeAlertKey,
} from "./alerts";

const CYCLE = new Date(2026, 7, 1).getTime();
const NEXT_CYCLE = new Date(2026, 8, 1).getTime();
const DAY_18 = new Date(2026, 7, 18).getTime();
const DAY_17 = new Date(2026, 7, 17).getTime();
const TODAY = spikeAlertKey(DAY_18, "MOBILE");
const WIFI_TODAY = spikeAlertKey(DAY_18, "WIFI");
const GB = 1024 ** 3;

const warn = (limit: number, percent = 80) =>
  limitAlertKey("warn", CYCLE, limit, percent, "MOBILE");
const over = (limit: number) => limitAlertKey("over", CYCLE, limit, 80, "MOBILE");
const wifiWarn = (limit: number, percent = 80) =>
  limitAlertKey("warn", CYCLE, limit, percent, "WIFI");

/** Fire `key` and return the keys that would be stored afterwards. */
const fire = (keys: string[], key: string, cycle = CYCLE, today = TODAY) => {
  const d = decideAlert(keys, key, cycle, today);
  expect(d.fire).toBe(true);
  return d.alertedKeys;
};

describe("limitAlertKey", () => {
  it("distinguishes two limits in the same cycle", () => {
    expect(warn(10 * GB)).not.toBe(warn(50 * GB));
    expect(over(10 * GB)).not.toBe(over(50 * GB));
  });

  it("distinguishes two warn percentages for the same limit", () => {
    expect(warn(10 * GB, 80)).not.toBe(warn(10 * GB, 90));
  });

  it("distinguishes the same threshold on the two networks", () => {
    expect(warn(10 * GB)).not.toBe(wifiWarn(10 * GB));
    expect(TODAY).not.toBe(WIFI_TODAY);
  });

  it("distinguishes warn from over", () => {
    expect(warn(10 * GB)).not.toBe(over(10 * GB));
  });
});

describe("decideAlert", () => {
  it("fires the first time and stays quiet after", () => {
    const stored = fire([], warn(10 * GB));
    expect(stored).toEqual([warn(10 * GB)]);
    expect(decideAlert(stored, warn(10 * GB), CYCLE, TODAY).fire).toBe(false);
  });

  it("re-arms when the limit is raised mid-cycle", () => {
    const stored = fire([], warn(10 * GB));
    expect(decideAlert(stored, warn(50 * GB), CYCLE, TODAY).fire).toBe(true);
  });

  it("re-arms when the limit is lowered mid-cycle", () => {
    const stored = fire([], over(10 * GB));
    expect(decideAlert(stored, over(2 * GB), CYCLE, TODAY).fire).toBe(true);
  });

  it("re-arms on a new cycle and forgets the old cycle's keys", () => {
    const stored = fire([], warn(10 * GB));
    const next = decideAlert(
      stored,
      limitAlertKey("warn", NEXT_CYCLE, 10 * GB, 80, "MOBILE"),
      NEXT_CYCLE,
      TODAY
    );
    expect(next.fire).toBe(true);
    expect(next.alertedKeys).toEqual([
      limitAlertKey("warn", NEXT_CYCLE, 10 * GB, 80, "MOBILE"),
    ]);
  });

  it("lets over follow warn within one cycle, then goes quiet", () => {
    let stored = fire([], warn(10 * GB));
    stored = fire(stored, over(10 * GB));
    expect(stored).toEqual([warn(10 * GB), over(10 * GB)]);
    expect(decideAlert(stored, over(10 * GB), CYCLE, TODAY).fire).toBe(false);
  });

  it("does not let a spike alert un-arm a limit alert", () => {
    let stored = fire([], warn(10 * GB));
    stored = fire(stored, TODAY);
    expect(decideAlert(stored, warn(10 * GB), CYCLE, TODAY).fire).toBe(false);
  });

  it("re-arms a spike on the next day but keeps the cycle's limit keys", () => {
    let stored = fire([], warn(10 * GB));
    stored = fire(stored, spikeAlertKey(DAY_17, "MOBILE"));
    const next = decideAlert(stored, TODAY, CYCLE, TODAY);
    expect(next.fire).toBe(true);
    expect(next.alertedKeys).toEqual([warn(10 * GB), TODAY]);
  });

  it("keeps each network's keys when the other one fires", () => {
    let stored = fire([], warn(10 * GB));
    stored = fire(stored, wifiWarn(100 * GB));
    expect(stored).toEqual([warn(10 * GB), wifiWarn(100 * GB)]);

    // Neither network re-fires, and neither drops the other's key.
    expect(decideAlert(stored, warn(10 * GB), CYCLE, TODAY).fire).toBe(false);
    expect(decideAlert(stored, wifiWarn(100 * GB), CYCLE, WIFI_TODAY).fire).toBe(
      false
    );
    expect(
      decideAlert(stored, wifiWarn(100 * GB), CYCLE, WIFI_TODAY).alertedKeys
    ).toEqual(stored);
  });

  it("keeps the other network's spike key for the same day", () => {
    let stored = fire([], TODAY);
    stored = fire(stored, WIFI_TODAY, CYCLE, WIFI_TODAY);
    expect(stored).toEqual([TODAY, WIFI_TODAY]);
  });

  it("drops both networks' keys on a new cycle, spikes aside", () => {
    let stored = fire([], warn(10 * GB));
    stored = fire(stored, wifiWarn(100 * GB));
    stored = fire(stored, TODAY);

    const nextKey = limitAlertKey("warn", NEXT_CYCLE, 10 * GB, 80, "MOBILE");
    const next = decideAlert(stored, nextKey, NEXT_CYCLE, TODAY);
    expect(next.fire).toBe(true);
    expect(next.alertedKeys).toEqual([TODAY, nextKey]);
  });

  it("drops keys written in a format this version no longer produces", () => {
    const legacy = ["warn:" + CYCLE + ":" + 10 * GB + ":80", "spike:2026-08-18"];
    const next = decideAlert(legacy, warn(10 * GB), CYCLE, TODAY);
    expect(next.fire).toBe(true);
    expect(next.alertedKeys).toEqual([warn(10 * GB)]);
  });

  it("two devices crossing the same limit threshold in the same cycle each notify once", () => {
    const keyA = limitAlertKey("over", CYCLE, 10 * GB, 80, "MOBILE", "deviceA");
    const keyB = limitAlertKey("over", CYCLE, 10 * GB, 80, "MOBILE", "deviceB");
    expect(keyA).not.toBe(keyB);

    let stored = fire([], keyA);
    stored = fire(stored, keyB);
    expect(stored).toEqual([keyA, keyB]);

    // Neither device's key fires a second time...
    expect(decideAlert(stored, keyA, CYCLE, TODAY).fire).toBe(false);
    expect(decideAlert(stored, keyB, CYCLE, TODAY).fire).toBe(false);
    // ...and neither drops the other's.
    expect(decideAlert(stored, keyA, CYCLE, TODAY).alertedKeys).toEqual(stored);
  });

  it("two devices crossing the same spike threshold on the same day each notify once", () => {
    const keyA = spikeAlertKey(DAY_18, "MOBILE", "deviceA");
    const keyB = spikeAlertKey(DAY_18, "MOBILE", "deviceB");
    expect(keyA).not.toBe(keyB);

    let stored = fire([], keyA, CYCLE, keyA);
    stored = fire(stored, keyB, CYCLE, keyB);
    expect(stored).toEqual([keyA, keyB]);
    expect(decideAlert(stored, keyA, CYCLE, keyA).fire).toBe(false);
    expect(decideAlert(stored, keyB, CYCLE, keyB).fire).toBe(false);
  });

  it("a device's own (unsuffixed) key stays byte-for-byte what it always was", () => {
    expect(over(10 * GB)).toBe(`mobile:over:${CYCLE}:${10 * GB}`);
    expect(warn(10 * GB, 80)).toBe(`mobile:warn:${CYCLE}:${10 * GB}:80`);
    expect(TODAY).toBe(`mobile:spike:${new Date(DAY_18).toISOString().slice(0, 10)}`);
  });
});

describe("isStale", () => {
  const HOUR = 3_600_000;

  it("is not stale exactly at the 3-hour boundary or under it", () => {
    expect(isStale(1_000_000 - 3 * HOUR, 1_000_000)).toBe(false);
    expect(isStale(1_000_000 - HOUR, 1_000_000)).toBe(false);
  });

  it("is stale just past 3 hours", () => {
    expect(isStale(1_000_000 - 3 * HOUR - 1, 1_000_000)).toBe(true);
  });

  it("treats fresh (recent) data as not stale", () => {
    expect(isStale(1_000_000, 1_000_000)).toBe(false);
  });
});

describe("decideQuietChild", () => {
  const HOUR = 3_600_000;
  const DAY_MS = 24 * HOUR;

  it("does not fire before 24 hours of silence", () => {
    expect(decideQuietChild(1_000_000, 1_000_000 + DAY_MS - 1, undefined)).toBe(false);
  });

  it("fires once past 24 hours of silence", () => {
    expect(decideQuietChild(1_000_000, 1_000_000 + DAY_MS + 1, undefined)).toBe(true);
  });

  it("does not re-fire for the same lastSeen value already notified", () => {
    expect(decideQuietChild(1_000_000, 1_000_000 + DAY_MS + 1, 1_000_000)).toBe(false);
  });

  it("fires again once the child resumes and goes quiet with a newer lastSeen", () => {
    // Same child, same 24h-quiet situation, but lastSeen has moved forward
    // since the last notice — a fresh silence, not the one already reported.
    expect(decideQuietChild(2_000_000, 2_000_000 + DAY_MS + 1, 1_000_000)).toBe(true);
  });
});
