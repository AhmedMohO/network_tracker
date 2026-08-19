import type { LimitStatus } from "@/features/limits/limits";

import { applyGrant, suggestAskedBytes, type GrantPayload } from "./request";

const GB = 1024 ** 3;

function status(overrides: Partial<LimitStatus>): LimitStatus {
  return {
    usedBytes: 0,
    limitBytes: 5 * GB,
    remainingBytes: 0,
    usedPercent: 0,
    elapsedPercent: 0,
    projectedBytes: 0,
    state: "warn",
    ...overrides,
  };
}

describe("suggestAskedBytes", () => {
  it("asks for the projected overage when the projection is actually over the limit", () => {
    const s = status({ limitBytes: 5 * GB, projectedBytes: 8 * GB, state: "over" });
    expect(suggestAskedBytes(s)).toBe(3 * GB);
  });

  it("falls back to a flat 10% bump when warn fired on pace but the projection is still under the limit", () => {
    const s = status({ limitBytes: 10 * GB, projectedBytes: 9 * GB, state: "warn" });
    expect(suggestAskedBytes(s)).toBe(1 * GB);
  });

  it("never proposes asking for nothing", () => {
    const s = status({ limitBytes: 10 * GB, projectedBytes: 10 * GB, state: "warn" });
    expect(suggestAskedBytes(s)).toBeGreaterThan(0);
  });
});

describe("applyGrant", () => {
  const grant: GrantPayload = { grantedBytes: 2 * GB, at: 500, requestAt: 100 };

  it("raises the limit exactly once across four consecutive syncs against the same grant row", () => {
    // This is the load-bearing regression: a `grant` row is never deleted
    // once written (ponytail note in task-33-brief.md Step 3), so the same
    // row is what every later sync sees too. Matching on `requestAt` rather
    // than presence is the only thing standing between this and raising the
    // limit forever.
    let limitBytes: number | null = 5 * GB;
    let appliedRequestAt: number | null = null;
    let pendingRequestAt: number | null = 100;
    let raises = 0;

    for (let i = 0; i < 4; i++) {
      const outcome = applyGrant(grant, pendingRequestAt, appliedRequestAt, limitBytes);
      if (outcome.apply) {
        limitBytes = outcome.newLimitBytes;
        raises++;
      }
      appliedRequestAt = outcome.appliedRequestAt;
      if (outcome.clearPending) pendingRequestAt = null;
    }

    expect(raises).toBe(1);
    expect(limitBytes).toBe(7 * GB);
  });

  it("clears the pending request on a decline (grantedBytes: 0) without raising the limit", () => {
    const decline: GrantPayload = { grantedBytes: 0, at: 500, requestAt: 100 };
    const outcome = applyGrant(decline, 100, null, 5 * GB);
    expect(outcome.apply).toBe(false);
    expect(outcome.newLimitBytes).toBe(5 * GB);
    expect(outcome.clearPending).toBe(true);
    expect(outcome.appliedRequestAt).toBe(100);
  });

  it("does not clear a request this grant does not answer", () => {
    // `pendingRequestAt` names a newer, still-outstanding request; this grant
    // answers an older one already superseded.
    const outcome = applyGrant(grant, 999, null, 5 * GB);
    expect(outcome.clearPending).toBe(false);
    // Still a real, unseen grant — it still raises the limit.
    expect(outcome.apply).toBe(true);
  });

  it("treats a null currentLimitBytes as zero rather than throwing", () => {
    const outcome = applyGrant(grant, 100, null, null);
    expect(outcome.newLimitBytes).toBe(grant.grantedBytes);
  });

  it("does not re-apply a grant whose requestAt was already recorded, even with no pending request left", () => {
    const outcome = applyGrant(grant, null, 100, 5 * GB);
    expect(outcome.apply).toBe(false);
    expect(outcome.clearPending).toBe(false);
    expect(outcome.newLimitBytes).toBe(5 * GB);
  });
});
