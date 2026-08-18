import { decideAlert, limitAlertKey, spikeAlertKey } from "./alerts";

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
});
