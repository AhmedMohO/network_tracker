import type { LimitStatus } from "@/features/limits/limits";

/** The wire shape of a `request` row's payload — see `docs/family-schema.sql`. */
export type RequestPayload = { askedBytes: number; at: number };

/**
 * The wire shape of a `grant` row's payload. `requestAt` is what makes an old
 * grant identifiable as stale once a new request supersedes it, or already
 * answered once processed — see `applyGrant`. `grantedBytes: 0` is how a
 * decline is written; there is no fifth `SnapshotKind` for it.
 */
export type GrantPayload = { grantedBytes: number; at: number; requestAt: number };

/**
 * How much more to ask for: the projected overage this cycle (already
 * computed by `limitStatus`, and the same figure `LimitCard`'s own
 * projection row shows), or — when `warn` fired on usage pace alone and the
 * projection is not actually over the limit yet — a flat 10% bump, so the
 * button never proposes asking for nothing.
 */
export function suggestAskedBytes(status: LimitStatus): number {
  const overage = status.projectedBytes - status.limitBytes;
  const minBump = status.limitBytes * 0.1;
  return Math.round(Math.max(overage, minBump));
}

export type GrantOutcome = {
  /** Whether the outstanding request this grant answers should be cleared. */
  clearPending: boolean;
  /** Whether `mobileLimitBytes` should be raised on this call. */
  apply: boolean;
  /** The limit to persist when `apply` is true; unchanged otherwise. */
  newLimitBytes: number;
  /**
   * The `requestAt` to persist as already-seen, so a repeat sync of the same
   * (never-deleted) grant row is a no-op.
   */
  appliedRequestAt: number;
};

/**
 * Decides what a `grant` row means for this sync. Matching on `requestAt`,
 * not on the mere presence of a grant row, is what keeps a lingering row —
 * ponytail: it stays until the next unpair or the 90-day prune, applied-ness
 * is tracked locally instead of server-side; fine for one outstanding
 * request per device, needs a server-side ack if this ever queues — from
 * raising the limit on every future sync. See task-33-brief.md Step 3.
 *
 * `pendingRequestAt` (the outstanding request this device is waiting on) and
 * `alreadyAppliedRequestAt` (the last grant this device has already acted on)
 * are deliberately separate: a grant can answer a request that was already
 * superseded by a newer one (`pendingRequestAt` has moved on), in which case
 * it still must not raise the limit a second time, but also must not clear a
 * request it was never an answer to.
 */
export function applyGrant(
  grant: GrantPayload,
  pendingRequestAt: number | null,
  alreadyAppliedRequestAt: number | null,
  currentLimitBytes: number | null
): GrantOutcome {
  const answersPending = pendingRequestAt !== null && grant.requestAt === pendingRequestAt;
  const alreadyApplied = grant.requestAt === alreadyAppliedRequestAt;
  const base = currentLimitBytes ?? 0;
  const apply = !alreadyApplied && grant.grantedBytes > 0;

  return {
    clearPending: answersPending,
    apply,
    newLimitBytes: apply ? base + grant.grantedBytes : base,
    appliedRequestAt: grant.requestAt,
  };
}
