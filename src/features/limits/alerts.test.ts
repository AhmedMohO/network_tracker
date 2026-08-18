import { decideAlert, limitAlertKey, spikeAlertKey } from "./alerts";

const CYCLE = new Date(2026, 7, 1).getTime();
const NEXT_CYCLE = new Date(2026, 8, 1).getTime();
const TODAY = spikeAlertKey(new Date(2026, 7, 18).getTime());
const GB = 1024 ** 3;

const warn = (limit: number, percent = 80) =>
  limitAlertKey("warn", CYCLE, limit, percent);
const over = (limit: number) => limitAlertKey("over", CYCLE, limit, 80);

/** Fire `key` and return the keys that would be stored afterwards. */
const fire = (keys: string[], key: string, cycle = CYCLE) => {
  const d = decideAlert(keys, key, cycle, TODAY);
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
      limitAlertKey("warn", NEXT_CYCLE, 10 * GB, 80),
      NEXT_CYCLE,
      TODAY
    );
    expect(next.fire).toBe(true);
    expect(next.alertedKeys).toEqual([
      limitAlertKey("warn", NEXT_CYCLE, 10 * GB, 80),
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
    stored = fire(stored, spikeAlertKey(new Date(2026, 7, 17).getTime()));
    const next = decideAlert(stored, TODAY, CYCLE, TODAY);
    expect(next.fire).toBe(true);
    expect(next.alertedKeys).toEqual([warn(10 * GB), TODAY]);
  });
});
