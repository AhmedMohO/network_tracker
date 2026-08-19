# Family Tracking — Parent/Child Usage Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Continues from:** [`2026-08-18-network-usage-phases-3-7.md`](./2026-08-18-network-usage-phases-3-7.md) (Tasks 1–24). Task numbering continues at 25.

**Supersedes:** that plan's "Deliberately not built → Cloud sync, accounts, multi-device" entry, which said *"If this ever changes, it is a new project, not a phase."* This is that change, and the entry was right about the cost: §Privacy below is not optional paperwork, it is the reason this plan is shaped the way it is.

**Goal:** A parent's device can see a child's device's network usage — history, today so far, and what the child's phone was doing at the last check-in — without turning this app into a hosted product with accounts.

**Architecture:** Unchanged on device. Kotlin stays a thin reader. The child pushes the rollups it *already computes* in `runUsageCheck`; the parent pulls them and renders them through the *existing* `TotalsCard` / `AppRow` / `UsageChart`, because the pulled payload is `AppUsage[]` — the same type those components already take. The new surface is one Postgres table, three RPCs, and one `fetch` wrapper.

**Tech Stack additions:** `expo-crypto` (CSPRNG for the pair token — `Math.random` is not acceptable for a bearer secret). Supabase free tier for storage. **No SDK**: `@supabase/supabase-js` is ~100 KB to send two POSTs; PostgREST is plain `fetch`.

---

## What this plan does NOT build

Named up front so no task quietly reintroduces them. Each was in the source wishlist (`docs/temp-plan.md`) and each is cut for a stated reason, not for convenience.

| Cut | Why |
|---|---|
| **Remote pause / throttle / block an app's data** | No public Android API. Per-app network policy is `MANAGE_NETWORK_POLICY`, `signature\|privileged`. Only a Device Owner DPC can do it, which needs ADB provisioning on a factory-reset device. If you ever want this, it is a separate project with a device-provisioning story, not a task here. |
| **Enforced app-specific limits and bedtime windows** | Same wall. This plan can *alert* on a child's usage; it cannot *stop* it. Any UI that implies enforcement is a lie and must not ship. |
| **Per-child, per-app live speed** | `useLiveApps.ts` already documents that Android exposes no live per-app throughput, and Phase 0 Q5 recorded this device's mobile counters jumping ±1.1 GB in 11 s. A remote per-app speed number would be fabricated twice over. |
| **Hourly heatmap / 24-hour timeline** | Buckets are ~2 h wide and attributed whole to their start bin; `chooseBucketMs` is floored at 2 h for exactly this. "Hourly" is precision this data does not have. |
| **Real-time streaming, pub/sub, websockets** | The child can only report on Android's 15-minute background floor. A realtime channel would deliver 15-minute-old data at 60 fps. |
| **End-to-end encryption** | Incompatible with the source plan's own server-side threshold logic, and the pair token already gates access. Encrypting with a key both devices hold and the server never sees is achievable, but buys nothing until there is a server operator to distrust. Revisit if this ever becomes multi-tenant. |
| **Accounts, roles table, co-guardians, child PIN lock** | The pair token *is* the family. And a PIN on a sideloaded APK the child can uninstall — they already hold `REQUEST_INSTALL_PACKAGES` — is theatre. |
| **Tamper watchdog ("alert if the app is killed")** | Doze plus the 15-minute `BackgroundTask` floor makes this fire every night on a healthy device. What *is* honest, and is built here, is a **last-seen timestamp** the parent reads for themselves. |

---

## Global Constraints

All constraints from the previous two plans still apply. Additionally:

- **No foreground service.** Still true. The child reports on the existing 15-minute `USAGE_CHECK_TASK` and nothing more.
- **Every figure the parent sees carries its own "as of" time.** A number without one is a bug in this feature, not a cosmetic gap. The child's clock is the source; render it in the parent's locale via `src/i18n/format.ts`.
- **Nothing is pushed until a pair token exists.** An unpaired install is byte-for-byte the app that shipped in Phase 7: zero network calls, zero rows.
- **Push is best-effort and never blocks a local result.** A failed sync must not cost `runUsageCheck` its alerts or its `snapshotDay` — the same `try/catch` posture the archive snapshot already uses.
- **Payloads carry no content.** App *names* and *byte counts* only — never URLs, never SSIDs (a home Wi-Fi SSID is a geolocator), never contacts, never screen text.
- **Test on two physical devices.** Every task in Phases 9–11 has a two-device round trip. An emulator pair is acceptable for Phase 8 only.

---

## Privacy — read before Task 25

Phases 1–7 could say *"nothing leaves the device."* After this plan that is false, and the app must say so where the user can see it. This is a hard requirement of Task 28, not a nice-to-have.

**What leaves the child's device:** per-day, per-app, per-network byte totals; app display names and package names; today's running totals; at heartbeat time, the foreground package name, battery percent, and connection type (`MOBILE`/`WIFI`/`NONE` — the *type*, never the SSID or the carrier).

**What never leaves:** anything not in that list. In particular no location, no SSID, no browsing content, no message content, no screen contents.

**Who can read it:** anyone holding the pair token. It is a bearer secret. Task 28 sends it over the OS share sheet, which means it will sit in a chat thread indefinitely — so **unpair must rotate it**, not merely forget it locally.

**Retention and deletion:** the table holds 90 days (Task 26 schedules the prune). "Unpair and delete" in Task 28 calls an RPC that hard-deletes every row for that token, from either side of the pair.

**Backups: none, deliberately.** The Supabase free plan includes no automatic backups, and that is the correct posture here rather than a gap to close. Every row in this table is *derived* — the child's SQLite archive is the authoritative copy. Losing the entire project costs the parent their view of history and nothing else; it re-populates as the children check in. Do not "fix" this by paying for backups, and do not let anything in this feature become the only copy of something.

**Disclosure:** the child device shows a persistent, non-dismissible banner on its home screen while paired, naming the parent device label and what is shared, with unpair one tap away. A monitoring app that hides its monitoring is stalkerware regardless of intent; the banner is what makes this not that. It is built in Task 28 and it does not get an "advanced setting" to turn it off.

---

# Phase 8 — Pairing and transport

No UI in this phase. It ends with a child device pushing a real payload and a `curl` proving a parent could read it.

---

### Task 25: Pair token, device identity and family settings

Pure functions and one storage extension. No network, no UI.

**Files:**
- Create: `src/features/family/pair.ts`
- Create: `src/features/family/pair.test.ts`
- Modify: `src/features/usage/settings.ts`

**Interfaces:**
- Consumes: `expo-crypto`
- Produces:
  - `newPairToken(): string` — 32 hex chars from 16 CSPRNG bytes
  - `newDeviceId(): string` — same generator, different purpose
  - `pairLink(token: string, label: string): string` — `nettrack://pair?t=…&label=…`
  - `parsePairLink(url: string): { token: string; label: string } | null`
  - Settings additions: `familyRole: 'parent' | 'child' | null`, `pairToken: string | null`, `deviceId: string | null`, `deviceLabel: string | null`

- [ ] **Step 1: Install the package**

```bash
npx expo install expo-crypto
```

- [ ] **Step 2: Write the failing test**

Create `src/features/family/pair.test.ts`:

```ts
import { newPairToken, pairLink, parsePairLink } from "./pair";

describe("newPairToken", () => {
  it("is 32 hex characters", () => {
    expect(newPairToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 100 }, newPairToken));
    expect(tokens.size).toBe(100);
  });
});

describe("parsePairLink", () => {
  it("round-trips a link", () => {
    const token = newPairToken();
    expect(parsePairLink(pairLink(token, "Dad's phone"))).toEqual({
      token,
      label: "Dad's phone",
    });
  });

  it("survives a label with spaces and punctuation", () => {
    const token = newPairToken();
    const parsed = parsePairLink(pairLink(token, "Mum and Dad's Pixel"));
    expect(parsed?.label).toBe("Mum and Dad's Pixel");
  });

  it("rejects a link with no token", () => {
    expect(parsePairLink("nettrack://pair?label=x")).toBeNull();
  });

  it("rejects a token that is not 32 hex characters", () => {
    expect(parsePairLink("nettrack://pair?t=short&label=x")).toBeNull();
    expect(parsePairLink(`nettrack://pair?t=${"z".repeat(32)}&label=x`)).toBeNull();
  });

  it("rejects another scheme carrying the right shape", () => {
    expect(parsePairLink(`https://evil.test/pair?t=${"a".repeat(32)}`)).toBeNull();
  });

  it("rejects a nettrack link that is not the pair route", () => {
    expect(parsePairLink(`nettrack://update?t=${"a".repeat(32)}`)).toBeNull();
  });

  it("returns null rather than throwing on junk", () => {
    expect(parsePairLink("")).toBeNull();
    expect(parsePairLink("not a url at all")).toBeNull();
  });

  it("defaults a missing label rather than failing", () => {
    const token = "a".repeat(32);
    expect(parsePairLink(`nettrack://pair?t=${token}`)?.label).toBe("");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest src/features/family/pair.test.ts`
Expected: FAIL — `Cannot find module './pair'`.

- [ ] **Step 4: Implement**

Create `src/features/family/pair.ts`:

```ts
import * as Crypto from "expo-crypto";

const SCHEME = "nettrack";
const HOST = "pair";
const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

function randomHex(bytes: number): string {
  return Array.from(Crypto.getRandomBytes(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The pair token is a bearer secret: whoever holds it reads the child's usage
 * history. `Math.random` is seeded predictably enough on some JS engines to be
 * a real risk here, so this goes through the platform CSPRNG.
 */
export function newPairToken(): string {
  return randomHex(TOKEN_BYTES);
}

/** Distinguishes two devices inside one pair. Not a secret, but no reason to reuse. */
export function newDeviceId(): string {
  return randomHex(TOKEN_BYTES);
}

export function pairLink(token: string, label: string): string {
  return `${SCHEME}://${HOST}?t=${token}&label=${encodeURIComponent(label)}`;
}

/**
 * Parses a deep link into a pairing, or null. Strict on purpose: this runs on
 * whatever URL the OS hands the app, including one an attacker put in a chat
 * message. A wrong scheme, a wrong route, or a token that is not exactly the
 * shape `newPairToken` produces is rejected rather than half-accepted.
 */
export function parsePairLink(url: string): { token: string; label: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SCHEME}:`) return null;
  // React Native's URL polyfill puts `pair` in `host` for `scheme://pair?x`,
  // but a stricter parser can leave it in `pathname`. Accept either rather
  // than depending on which one is loaded.
  const route = parsed.host || parsed.pathname.replace(/^\/+/, "");
  if (route !== HOST) return null;

  const token = parsed.searchParams.get("t");
  if (!token || !TOKEN_PATTERN.test(token)) return null;

  return { token, label: parsed.searchParams.get("label") ?? "" };
}
```

- [ ] **Step 5: Extend the settings type**

In `src/features/usage/settings.ts`, add to `Settings` and to `DEFAULTS` (all four default to `null`):

```ts
  /** null until this install joins a pair. See `features/family/pair`. */
  familyRole: "parent" | "child" | null;
  pairToken: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
```

The existing `{ ...DEFAULTS, ...stored }` merge means an upgrade install lands unpaired with no migration — which is the correct default, and is why `familyRole` is nullable rather than defaulting to `"parent"`.

- [ ] **Step 6: Run the tests**

Run: `npx jest src/features/family/pair.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: pair token, device identity and family settings"
```

---

### Task 26: The sync table

SQL only. No app code in this task — it ends with `curl` proving the RPCs work, so Task 27 has something real to write against.

**Files:**
- Create: `docs/family-schema.sql`
- Modify: `app.json` (`expo.extra`), `README.md`

**Interfaces:**
- Produces: Supabase RPCs `family_push`, `family_pull`, `family_forget`

**Design note.** Row-level security driven by PostgREST request headers is fiddly and easy to get subtly wrong. Three `SECURITY DEFINER` functions with RLS denying all direct table access is fewer moving parts and fails closed: the anon key alone reads nothing, and every path into the table must present the token as an argument.

- [ ] **Step 1: Create the project**

Create a Supabase project (free tier). Record the project URL and the **anon** key. The service-role key is never used by this app and must never enter the repo.

- [ ] **Step 2: Write the schema**

Create `docs/family-schema.sql`:

```sql
-- One table for the whole feature. `kind` distinguishes what a row is:
--   'daily'   -- one complete day's rollup, day = that day's local start
--   'recent'  -- today so far plus device context, day = 0, upserted each check
--   'request' -- the child asking for a higher limit, day = 0
--   'grant'   -- the parent's answer, day = 0
-- Four kinds in one table rather than four tables: they share a primary key,
-- a retention rule and a delete path, and none of them is ever joined.
create table if not exists family_snapshots (
  pair_token   text        not null,
  device_id    text        not null,
  device_label text        not null default '',
  kind         text        not null check (kind in ('daily','recent','request','grant')),
  day          bigint      not null default 0,
  payload      jsonb       not null,
  updated_at   timestamptz not null default now(),
  primary key (pair_token, device_id, kind, day)
);

create index if not exists idx_family_token_updated
  on family_snapshots (pair_token, updated_at desc);

-- Deny everything by default. The three functions below are the only way in.
alter table family_snapshots enable row level security;
revoke all on family_snapshots from anon, authenticated;

create or replace function family_push(
  p_token text, p_device text, p_label text,
  p_kind text, p_day bigint, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Cheapest possible abuse brake: a token is 32 hex chars or it is not a token.
  if p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bad token';
  end if;
  insert into family_snapshots
    (pair_token, device_id, device_label, kind, day, payload, updated_at)
  values (p_token, p_device, p_label, p_kind, p_day, p_payload, now())
  on conflict (pair_token, device_id, kind, day)
  do update set payload      = excluded.payload,
                device_label = excluded.device_label,
                updated_at   = now();
end $$;

-- `p_since` lets the parent pull only what changed, so a daily poll does not
-- re-download 90 days of history every time.
create or replace function family_pull(p_token text, p_since timestamptz default '-infinity')
returns table (device_id text, device_label text, kind text, day bigint,
               payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bad token';
  end if;
  return query
    select s.device_id, s.device_label, s.kind, s.day, s.payload, s.updated_at
      from family_snapshots s
     where s.pair_token = p_token and s.updated_at > p_since
     order by s.updated_at;
end $$;

-- Unpair. Callable from either device, deletes the whole pair. There is no
-- soft delete: "delete my data" that keeps the data is a lie.
create or replace function family_forget(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from family_snapshots where pair_token = p_token;
end $$;

-- 90-day retention, matching what the on-device archive is for.
create or replace function family_prune() returns void
language sql security definer set search_path = public as $$
  delete from family_snapshots where updated_at < now() - interval '90 days';
$$;

-- Postgres grants EXECUTE on every new function to PUBLIC by default, so an
-- explicit `grant ... to anon` would widen nothing and would leave
-- `family_prune` exposed on /rest/v1/rpc/family_prune to anyone holding the
-- anon key. Revoke PUBLIC on all four, then re-grant only the three that
-- are the API.
revoke all on function family_push(text, text, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function family_pull(text, timestamptz) from public, anon, authenticated;
revoke all on function family_forget(text) from public, anon, authenticated;

-- Never reachable from the client. Only the pg_cron job, which runs as the
-- function owner, needs to call this.
revoke all on function family_prune() from public, anon, authenticated;

grant execute on function family_push(text, text, text, text, bigint, jsonb) to anon;
grant execute on function family_pull(text, timestamptz) to anon;
grant execute on function family_forget(text) to anon;
```

- [ ] **Step 3: Apply it and schedule the prune**

Run the file in the Supabase SQL editor. Then schedule `family_prune()` daily — `pg_cron` if the project has it, otherwise a scheduled Edge Function. A retention policy nobody runs is not a retention policy.

- [ ] **Step 4: Configure the app**

In `app.json` under `expo.extra`:

```json
"family": {
  "url": "https://YOUR-PROJECT.supabase.co",
  "anonKey": "YOUR-ANON-KEY"
}
```

The anon key is a public client credential by design — it grants nothing without a pair token. Note in `README.md` that it is still not something to put in a screenshot, and that the service-role key never belongs in this repo.

- [ ] **Step 5: Verify with curl**

```bash
TOKEN=$(printf 'a%.0s' {1..32})

curl -s -X POST "$URL/rest/v1/rpc/family_push" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"p_token\":\"$TOKEN\",\"p_device\":\"d1\",\"p_label\":\"Test\",
       \"p_kind\":\"recent\",\"p_day\":0,\"p_payload\":{\"hello\":\"world\"}}"

curl -s -X POST "$URL/rest/v1/rpc/family_pull" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"p_token\":\"$TOKEN\"}"
```

Expected: the second call returns the row. Then confirm it fails closed:

```bash
curl -s "$URL/rest/v1/family_snapshots?select=*" -H "apikey: $ANON"
```

Expected: **empty or permission denied, never the row.** If this returns data, RLS is not on and this task is not done. Also confirm `family_pull` with a 31-character token returns `bad token`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: family sync schema with token-gated RPCs"
```

---

### Task 27: Sync client, and the child's push

**Files:**
- Create: `src/features/family/sync.ts`
- Create: `src/features/family/sync.test.ts`
- Modify: `src/features/limits/backgroundCheck.ts`

**Interfaces:**
- Consumes: `loadSettings`, `readArchive`, `fetchUsage`, `presetRange`
- Produces:
  - `type Snapshot = { deviceId; deviceLabel; kind; day; payload; updatedAt }`
  - `type DeviceContext = { foregroundPackage: string | null; batteryPercent: number | null; connection: 'MOBILE' | 'WIFI' | 'NONE' }`
  - `dailyPayload(apps)`, `recentPayload(apps, totals, context, at)` — pure, tested
  - `pushSnapshot(kind, day, payload)` — no-ops when unpaired
  - `pullSnapshots(since?)`, `forgetPair(token)`
  - `syncFromChild(now, context?)` — the whole child-side push
  - Settings additions: `lastSyncOkAt: number | null`, `lastSyncErrorAt: number | null`, `syncErrorNotifiedAt: number | null`

- [ ] **Step 1: Write the failing test**

Create `src/features/family/sync.test.ts`. The payload builders are the part worth testing; the wire is `fetch`.

```ts
import type { AppUsage } from "@/features/usage/aggregate";
import { dailyPayload, recentPayload } from "./sync";

const app = (uid: number, total: number): AppUsage => ({
  uid, name: `app${uid}`, packageName: `com.a${uid}`,
  download: total, upload: 0, total, foreground: 0, background: 0, percentage: 0,
});

describe("dailyPayload", () => {
  it("keeps app identity and bytes", () => {
    const p = dailyPayload([app(1, 100), app(2, 50)]);
    expect(p.apps).toHaveLength(2);
    expect(p.apps[0]).toEqual({ uid: 1, name: "app1", pkg: "com.a1", dl: 100, ul: 0 });
  });

  it("drops apps with no traffic rather than shipping empty rows", () => {
    expect(dailyPayload([app(1, 100), app(2, 0)]).apps).toHaveLength(1);
  });

  it("caps the app list so one payload cannot grow unbounded", () => {
    const many = Array.from({ length: 200 }, (_, i) => app(i, 200 - i));
    const p = dailyPayload(many);
    expect(p.apps.length).toBeLessThanOrEqual(50);
    // The cap keeps the biggest, not the first 50 in whatever order arrived.
    expect(p.apps[0].uid).toBe(0);
    // Everything trimmed is still counted, so the parent's total matches the
    // child's total. A silently dropped tail would be fabricated accuracy.
    expect(p.otherBytes).toBeGreaterThan(0);
    expect(p.apps.reduce((s, a) => s + a.dl + a.ul, 0) + p.otherBytes)
      .toBe(many.reduce((s, a) => s + a.total, 0));
  });

  it("handles an empty list without inventing a total", () => {
    expect(dailyPayload([])).toEqual({ apps: [], otherBytes: 0 });
  });
});

describe("recentPayload", () => {
  it("stamps the child's clock so the parent can render an 'as of'", () => {
    const p = recentPayload([app(1, 10)], { mobile: 10, wifi: 0 }, null, 1_700_000_000_000);
    expect(p.at).toBe(1_700_000_000_000);
  });

  it("carries context through when the probe returned some", () => {
    const ctx = { foregroundPackage: "com.x", batteryPercent: 42, connection: "MOBILE" as const };
    expect(recentPayload([], { mobile: 0, wifi: 0 }, ctx, 1).context).toEqual(ctx);
  });

  it("carries null context rather than inventing defaults", () => {
    expect(recentPayload([], { mobile: 0, wifi: 0 }, null, 1).context).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/family/sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sync.ts`**

```ts
import Constants from "expo-constants";

import { readArchive } from "@/features/archive/db";
import type { AppUsage } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";
import { presetRange } from "@/features/usage/range";
import { loadSettings } from "@/features/usage/settings";

export type SnapshotKind = "daily" | "recent" | "request" | "grant";

export type DeviceContext = {
  foregroundPackage: string | null;
  batteryPercent: number | null;
  connection: "MOBILE" | "WIFI" | "NONE";
};

export type Snapshot = {
  deviceId: string;
  deviceLabel: string;
  kind: SnapshotKind;
  day: number;
  payload: any;
  updatedAt: number;
};

/** More than this and the payload stops being a few KB. */
const MAX_APPS = 50;
const DAY = 86_400_000;

const config = (Constants.expoConfig?.extra as any)?.family as
  | { url: string; anonKey: string }
  | undefined;

/**
 * Every call in and out of the backend goes through here, which is why the
 * success/failure stamps live here rather than in a health module: one place
 * sees every push and every pull.
 *
 * These stamps are not telemetry. A Supabase free project **pauses after one
 * week of inactivity**, and every caller of this function swallows its errors
 * so a failed sync cannot cost the local result. Without a recorded failure
 * time, a paused project is indistinguishable from a quiet family: the parent
 * sees stale numbers forever and nothing ever says why.
 */
async function rpc(name: string, body: Record<string, unknown>): Promise<any> {
  if (!config?.url) throw new Error("family sync is not configured");
  try {
    const res = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const text = await res.text();
    await saveSettings({ lastSyncOkAt: Date.now(), lastSyncErrorAt: null });
    return text ? JSON.parse(text) : null;
  } catch (e) {
    // Only the *first* failure of a run of failures is stamped, so the age of
    // this value answers "how long has sync been broken" rather than "when did
    // it last retry".
    const s = await loadSettings();
    if (s.lastSyncErrorAt === null) await saveSettings({ lastSyncErrorAt: Date.now() });
    throw e;
  }
}

/**
 * Short keys (`dl`/`ul`/`pkg`) because this is written once per day per device
 * and read over a metered connection; the long names buy nothing on the wire.
 * Apps past `MAX_APPS` fold into `otherBytes` rather than being dropped, so the
 * parent's total still equals the child's.
 */
export function dailyPayload(apps: AppUsage[]) {
  const used = apps.filter((a) => a.total > 0).sort((a, b) => b.total - a.total);
  const kept = used.slice(0, MAX_APPS);
  return {
    apps: kept.map((a) => ({
      uid: a.uid, name: a.name, pkg: a.packageName, dl: a.download, ul: a.upload,
    })),
    otherBytes: used.slice(MAX_APPS).reduce((s, a) => s + a.total, 0),
  };
}

export function recentPayload(
  apps: AppUsage[],
  totals: { mobile: number; wifi: number },
  context: DeviceContext | null,
  at: number
) {
  return { ...dailyPayload(apps), totals, context, at };
}

/** No-ops when unpaired. Every caller relies on that; do not add a throw. */
export async function pushSnapshot(kind: SnapshotKind, day: number, payload: unknown) {
  const s = await loadSettings();
  if (!s.pairToken || !s.deviceId) return;
  await rpc("family_push", {
    p_token: s.pairToken,
    p_device: s.deviceId,
    p_label: s.deviceLabel ?? "",
    p_kind: kind,
    p_day: day,
    p_payload: payload,
  });
}

export async function pullSnapshots(since = 0): Promise<Snapshot[]> {
  const s = await loadSettings();
  if (!s.pairToken) return [];
  const rows: any[] = await rpc("family_pull", {
    p_token: s.pairToken,
    p_since: new Date(since).toISOString(),
  });
  return (rows ?? []).map((r) => ({
    deviceId: r.device_id,
    deviceLabel: r.device_label,
    kind: r.kind,
    day: r.day,
    payload: r.payload,
    updatedAt: Date.parse(r.updated_at),
  }));
}

export async function forgetPair(token: string) {
  await rpc("family_forget", { p_token: token });
}

/**
 * The child's whole contribution: yesterday's completed day, and a `recent` row
 * for today so far. Both are idempotent — the RPC upserts — so a repeated run
 * costs a request and changes nothing.
 *
 * Yesterday comes from the archive rather than a fresh query, because
 * `snapshotDay` has just written it and Android is the slower of the two.
 */
export async function syncFromChild(now: number, context: DeviceContext | null = null) {
  const s = await loadSettings();
  if (s.familyRole !== "child" || !s.pairToken) return;

  const yesterday = presetRange("yesterday", now).start;
  await pushSnapshot(
    "daily",
    yesterday,
    dailyPayload(await readArchive(yesterday, yesterday + DAY, "ALL"))
  );

  const today = presetRange("today", now);
  const mobile = await fetchUsage(today, "MOBILE");
  const wifi = await fetchUsage(today, "WIFI");
  const all = await fetchUsage(today, "ALL");
  await pushSnapshot(
    "recent",
    0,
    recentPayload(
      all.apps,
      { mobile: mobile.totals.total, wifi: wifi.totals.total },
      context,
      now
    )
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/family/sync.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Call it from the background task**

In `src/features/limits/backgroundCheck.ts`, inside `runUsageCheck`, immediately after the existing `snapshotDay` block. Same posture as that block, and for the same reason — a sync failure must not cost the alerts their result:

```ts
  try {
    await syncFromChild(now);
  } catch {
    // Offline, or the project is paused. The next run re-pushes; the RPC
    // upserts. `rpc` has already stamped `lastSyncErrorAt` — Step 6 is what
    // stops that stamp from being a secret.
  }
```

- [ ] **Step 6: Notify when sync has been broken for two days**

Still inside `runUsageCheck`. It must fire **once per failure run** — and re-arm if sync recovers and later breaks again.

**Do not reuse `alertOnce` for this.** An earlier draft of this plan did, and it was wrong: `decideAlert` prunes every key whose first segment is not `mobile` or `wifi` (`NETWORKS` in `alerts.ts`), so a `sync-broken:` key is dropped from `alertedKeys` on every call, never counts as already-fired, and re-notifies every 15 minutes. Verified against `alerts.ts` — do not re-derive this, and do not "fix" it by prefixing the key with a network name, which would corrupt the limit/spike pruning instead.

Use a dedicated one-shot field on `Settings`, `syncErrorNotifiedAt: number | null`, holding the `lastSyncErrorAt` value already reported:

```ts
  const { lastSyncErrorAt, syncErrorNotifiedAt } = await loadSettings();
  if (
    lastSyncErrorAt &&
    now - lastSyncErrorAt > 2 * DAY &&
    syncErrorNotifiedAt !== lastSyncErrorAt
  ) {
    await notify(
      i18n.t("family.syncBrokenTitle"),
      i18n.t("family.syncBrokenBody", { date: formatDay(lastSyncErrorAt) })
    );
    await saveSettings({ syncErrorNotifiedAt: lastSyncErrorAt });
  }
```

Comparing against the failure-run timestamp is what re-arms it: a recovery clears `lastSyncErrorAt`, so the next failure gets a new value that no longer matches `syncErrorNotifiedAt`.

Two days, not two hours: a phone in Doze over a weekend, a router reboot, and a flight all produce multi-hour gaps that are not faults. Two days of total failure is not one of those, and one week is when Supabase pauses the project — this has to fire before that, not after.

The body names the actual remedy: *"Usage sharing hasn't reached the family server since {date}. Open the app on a paired device, or check the project isn't paused."*

- [ ] **Step 7: Verify on the device**

Set `familyRole: "child"`, a `pairToken` and a `deviceId` by hand (a temporary button on the probe tab is fine). Trigger the background task, then run the Task 26 `family_pull` curl.
Expected: a `daily` row for yesterday and a `recent` row for today, both matching what the app's own home screen shows for the same ranges. If they differ, stop — the payload builders are wrong, and every screen in Phase 9 inherits the error.

Then break it on purpose:

- [ ] Point `extra.family.url` at a dead host. Run the task: `lastSyncErrorAt` is stamped once and does not move on the next three runs.
- [ ] Backdate `lastSyncErrorAt` by three days: exactly one notification, and none on the run after it.
- [ ] Restore the URL: `lastSyncOkAt` advances and `lastSyncErrorAt` clears.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: family sync client and child-side push"
```

---

# Phase 9 — Pairing UI and the parent's view

The first phase with a two-device round trip. Nothing here is new logic; it is Phase 8's data rendered through components that already exist.

---

### Task 28: Pairing, disclosure and unpair

The trust boundary of this whole feature. Do not defer the disclosure banner or the delete path to "polish" — they are the reason the feature is shippable.

**Files:**
- Create: `src/features/family/useFamily.ts`
- Create: `src/features/family/PairingCard.tsx`
- Create: `src/features/family/SharingBanner.tsx`
- Modify: `src/app/(tabs)/settings.tsx`, `src/app/(tabs)/index.tsx`, `src/app/_layout.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/ar.ts`

**Interfaces:**
- Consumes: `newPairToken`, `newDeviceId`, `pairLink`, `parsePairLink`, `forgetPair`
- Produces:
  - `useFamily(): { role, token, deviceLabel, becomeParent(label), joinAsChild(token, label), unpair(): Promise<void> }`
  - `<PairingCard />` — the settings section
  - `<SharingBanner />` — the child's persistent disclosure

**Design note — why no QR scanner.** A QR would need `expo-camera` plus the `CAMERA` permission for a one-time exchange. The app already registers the `nettrack://` scheme, and React Native's built-in `Share` API costs nothing: the parent taps *Send pairing link*, picks a chat app, the child taps the link, and the app pairs itself. Zero new dependencies and no typing.

`ponytail: share-sheet pairing means the token sits in a chat thread forever. Unpair rotates it, which is the mitigation. Add QR (expo-camera) if a token ever needs to not exist off-device.`

- [ ] **Step 1: Write `useFamily.ts`**

A thin hook over `settings.ts` — no new storage. Three transitions:

- `becomeParent(label)` — mints a token and a device id, sets `familyRole: 'parent'`. Idempotent: re-calling on an already-paired parent returns the existing token rather than orphaning the children.
- `joinAsChild(token, label)` — stores the token, mints a device id, sets `familyRole: 'child'`.
- `unpair()` — calls `forgetPair(token)` **first**, then clears all four settings fields. Order matters: clearing locally first would leave the rows on the server with no client that knows the token to delete them. If the RPC fails, surface the error and do **not** clear locally, so the user can retry rather than being told their data is gone when it is not.

- [ ] **Step 2: Write `PairingCard.tsx`**

Rendered inside the existing settings `Card` stack, styled like the limits section. Three states:

| State | Shows |
|---|---|
| `role === null` | Two buttons: *This is a parent device* / *This is a child device*. The child button opens a paste field for a link, for when the share sheet is not an option. |
| `role === 'parent'` | Device label field, **Send pairing link** (`Share.share({ message: pairLink(token, label) })`), a list of paired children with last-seen, and **Unpair everyone**. |
| `role === 'child'` | *"Sharing usage with {parentLabel}"*, the full list of what is shared (verbatim from §Privacy), and **Stop sharing and delete my data**. |

Both unpair buttons go through `Alert.alert` confirmation naming what will be deleted. Deletion is not reversible and the copy says so.

- [ ] **Step 3: Handle the deep link**

In `src/app/_layout.tsx`, alongside the existing OTA effect. `expo-linking`'s `useURL()` covers both the cold start and the already-running case:

```tsx
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    const pairing = parsePairLink(url);
    if (!pairing) return;
    // Never pair silently: a link can arrive from anyone, and the whole point
    // of this feature is that the person being monitored knows about it.
    Alert.alert(
      i18n.t('family.joinTitle'),
      i18n.t('family.joinBody', { label: pairing.label }),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        { text: i18n.t('family.join'), onPress: () => joinAsChild(pairing.token, pairing.label) },
      ]
    );
  }, [url]);
```

- [ ] **Step 4: Write `SharingBanner.tsx` and mount it**

Renders `null` unless `role === 'child'`. Otherwise a permanent, non-dismissible strip at the top of `src/app/(tabs)/index.tsx`: *"Usage on this device is shared with {parentLabel}"* plus a **Details** link into settings.

There is no prop, setting, or build flag that hides it. If a future task adds one, that task is wrong.

- [ ] **Step 5: Amend the privacy card**

`settings.tsx` already has a `settings.privacyTitle` card whose text says data never leaves the device. That statement is now conditional. Rewrite it to state the unpaired case and the paired case separately, and keep §Privacy's "what leaves / what never leaves" list as the paired text. Update both `en.ts` and `ar.ts` — `en.ts` is the key list and `ar.ts` is checked against it.

- [ ] **Step 6: Verify on two devices**

- [ ] Parent mints a link, shares it to the child over any chat app; the child taps it and sees the join prompt naming the parent's label.
- [ ] Cancelling the prompt leaves the child unpaired and pushes nothing.
- [ ] Accepting pairs it, and the banner appears on the child's home screen and cannot be dismissed.
- [ ] The same link tapped twice does not create a second pairing or a second device id.
- [ ] A link with a mangled token shows nothing at all — no prompt, no error.
- [ ] Child taps *Stop sharing and delete my data*; `family_pull` afterwards returns zero rows.
- [ ] Unpair with the device in airplane mode: the app reports the failure and stays paired. Re-run online: it succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: device pairing, sharing disclosure and data deletion"
```

---

### Task 29: The parent's screens

Almost no new rendering code. The pulled payload maps to `AppUsage[]`, which `TotalsCard`, `AppRow` and `UsageChart` already take.

**Files:**
- Create: `src/features/family/useChildren.ts`
- Create: `src/features/family/fromPayload.ts`
- Create: `src/features/family/fromPayload.test.ts`
- Create: `src/app/family/index.tsx`
- Create: `src/app/family/[deviceId].tsx`
- Modify: `src/app/(tabs)/settings.tsx` (entry point), `src/i18n/*`

**Interfaces:**
- Consumes: `pullSnapshots`, `TotalsCard`, `AppRow`, `UsageChart`, `formatBytes`
- Produces:
  - `toAppUsage(payload): AppUsage[]` in `fromPayload.ts` — inverse of `dailyPayload`
  - `useChildren(): { children: ChildDevice[]; refresh(); loading }`
  - `type ChildDevice = { deviceId; label; lastSeen: number; recent: RecentPayload | null }`

- [ ] **Step 1: Write the failing test**

`fromPayload.test.ts` covers the inverse mapping, which is where a silent data error would hide:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/family/fromPayload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fromPayload.ts`**

The trimmed tail becomes a synthetic row named by `i18n.t('family.otherApps')`, using a UID that cannot collide with a real one (`-100`). Percentages divide by the grand total *including* `otherBytes` — dividing by the visible rows only would quietly inflate every percentage on the parent's screen, which is exactly the class of fabricated accuracy this project does not ship.

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/family/fromPayload.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write `useChildren.ts`**

Pulls on focus, no interval — `useFocusEffect`, the same posture as `useLiveApps`. Groups snapshots by `deviceId`, drops this device's own id, and derives `lastSeen` from the newest `updatedAt` across that device's rows.

Cache the pulled rows in the existing `expo-sqlite/kv-store` keyed by `pairToken`, and pass the newest `updatedAt` as `pullSnapshots(since)` on the next call. An offline parent then still sees the last known state with its real "as of" time, rather than an empty screen.

- [ ] **Step 6: Write the two screens**

`src/app/family/index.tsx` — one row per child: label, last-seen ("2 hours ago", `src/i18n/format.ts`), today's mobile/Wi-Fi totals from the `recent` payload. An empty list says *"No child devices have checked in yet"* and links to the pairing card, never a spinner that never resolves.

**Two staleness signals, never conflated.** They are different faults with different remedies, and showing only one of them produces a screen that lies:

| Signal | Source | Means | Says |
|---|---|---|---|
| Child last-seen | newest `updatedAt` among that child's rows | that child's device is not reporting | *"Leo's phone hasn't checked in since 14:20"* |
| Parent last sync | `lastSyncOkAt` / `lastSyncErrorAt` from Task 27 | **this** device cannot reach the backend at all | *"Not synced since Tuesday"*, screen-level, above the list |

A paused Supabase project makes *every* child look stale simultaneously, which reads as "all three kids turned their phones off" unless the screen-level banner says the pull itself is failing. Show that banner whenever `lastSyncErrorAt` is set, with the same remedy text as the notification.

`src/app/family/[deviceId].tsx` — a `RangePicker` (reused), then `TotalsCard` and the `AppRow` list built from the `daily` payloads in range, plus `UsageChart` over the daily totals.

Two rules that make this screen honest, and are the reason it is not just the home screen with a different data source:

1. **A header line stating the child's last check-in.** Always visible, never below the fold.
2. **Days with no `daily` row render as a gap, not as zero.** The child may simply have been offline. `UsageChart` must skip them; the totals line must say how many days in the selected range are missing.

Entry point: a *Family* row in the settings card stack when `role === 'parent'`. **Not a sixth native tab** — there are already five, one of which is the debug probe.

- [ ] **Step 7: Verify on two devices**

- [ ] Parent's family list shows the child within one background cycle of pairing (force a run rather than waiting 15 minutes).
- [ ] Child's detail screen totals for a completed day equal what the child's own home screen shows for that same day.
- [ ] Percentages on the parent's list sum to ~100% including the "Other apps" row.
- [ ] Turn the child off for a day: that day renders as a gap, and the totals line says a day is missing. It must not read as a zero-usage day.
- [ ] Put the parent in airplane mode: the cached view renders with its true "as of" time, **and** the screen-level "not synced" banner appears.
- [ ] With the parent's `extra.family.url` pointed at a dead host, the banner blames the connection — not the children. No child row may imply the child stopped reporting.
- [ ] A parent with no children paired sees the empty state, not a spinner.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: parent-side family list and per-child usage screens"
```

---

# Phase 10 — Device context at check-in

What the source wishlist called "Live Activity". It is not live — it is a **15-minute heartbeat**, because that is Android's background floor and this plan does not add a foreground service. Every string in this phase says so.

Skip this phase entirely if the parent only cares about byte totals. Phase 9 is complete without it.

---

### Task 30: Kotlin context probe

Three small reads through APIs the app already has permission for. No new manifest permission, and deliberately none of the ones that would need one.

**Files:**
- Modify: `modules/network-usage/android/src/main/java/expo/modules/networkusage/LiveProbe.kt`
- Modify: `.../NetworkUsageModule.kt`
- Modify: `modules/network-usage/src/NetworkUsage.types.ts`
- Modify: `modules/network-usage/index.web.ts`, `index.ios.ts`

**Interfaces:**
- Produces: `NetworkUsage.getDeviceContext(): { foregroundPackage: string | null; batteryPercent: number | null; connection: 'MOBILE' | 'WIFI' | 'NONE' }`

**Not built here, on purpose:**

- **Wi-Fi SSID.** Needs `ACCESS_FINE_LOCATION` and location services switched on from Android 10. A home SSID is a geolocator, and asking a child for location permission to display a network name is a bad trade. The connection *type* is what the parent actually needs.
- **Carrier name.** `READ_PHONE_STATE`, same reasoning, less value.

- [ ] **Step 1: Extend `LiveProbe.kt`**

```kotlin
    /**
     * The package in the foreground at the last MOVE_TO_FOREGROUND event inside
     * the lookback window, or null. `queryEvents` is used rather than
     * `queryUsageStats` because the latter's `lastTimeUsed` ordering is
     * unreliable across manufacturers.
     *
     * This reads the same PACKAGE_USAGE_STATS grant the rest of the module
     * needs, so it adds no new permission prompt.
     */
    fun foregroundPackage(context: Context, lookbackMs: Long = 60_000): String? {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(now - lookbackMs, now)
        val event = UsageEvents.Event()
        var latest: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                latest = event.packageName
            }
        }
        return latest
    }

    /** Null rather than a guess when the device does not report a level. */
    fun batteryPercent(context: Context): Int? {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (level in 0..100) level else null
    }

    /** Transport only. Never the SSID, never the carrier — see Task 30 notes. */
    fun connection(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "NONE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
            else -> "NONE"
        }
    }
```

- [ ] **Step 2: Expose it**

In `NetworkUsageModule.kt`, alongside `getDeviceCounters`:

```kotlin
        Function("getDeviceContext") {
            mapOf(
                "foregroundPackage" to LiveProbe.foregroundPackage(context),
                "batteryPercent" to LiveProbe.batteryPercent(context),
                "connection" to LiveProbe.connection(context)
            )
        }
```

Add the signature to `NetworkUsage.types.ts`. The stubs in `index.web.ts` and `index.ios.ts` are checked against that same type, so both must gain an entry that throws on call and is inert on import — the constraint from `docs/findings/phase-0.md` that a route file's import chain must never throw at module scope.

- [ ] **Step 3: Verify on the device**

Add a temporary readout on the probe tab. Open YouTube, background the app, return: the package name should be the one you just used. Confirm the battery reads within a few points of the status bar, and that toggling Wi-Fi flips `connection` between `WIFI` and `MOBILE`.

Note the observed `foregroundPackage` latency in `docs/findings/phase-0.md`. If it commonly returns null within the 60 s window on your device, widen the lookback and record the value you settled on — do **not** fall back to `queryUsageStats`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: foreground app, battery and connection type probe"
```

---

### Task 31: Heartbeat payload and its honest rendering

**Files:**
- Modify: `src/features/limits/backgroundCheck.ts`, `src/features/family/sync.ts`
- Modify: `src/app/family/[deviceId].tsx`, `src/app/family/index.tsx`
- Modify: `src/features/usage/AppIcon.tsx` (accept a package name with no local install)
- Modify: `src/i18n/*`

- [ ] **Step 1: Attach the context to the push**

In `backgroundCheck.ts`, pass it through — inside the existing `try`, so a probe failure costs the sync nothing:

```ts
    await syncFromChild(now, NetworkUsage.getDeviceContext());
```

- [ ] **Step 2: Render it, with the check-in time attached to every value**

On the child's card and detail screen:

> **Last check-in 12 minutes ago** — was using YouTube · 64% battery · on mobile data

The wording is the requirement, not a suggestion. **"Leo is currently using YouTube" is forbidden copy**: the reading is up to 15 minutes old and the app cannot know what is on screen right now. Use the past tense and name the check-in time. If the heartbeat is older than 45 minutes (three missed cycles), render *"No check-in since {time}"* instead of a stale app name.

- [ ] **Step 3: Resolve the foreground app's name**

The parent's device may not have the child's app installed, so `AppIcon` will find no local icon. Fall back to the name carried in the `recent` payload's app list when the package matches, and to the raw package name otherwise. Do not fetch icons over the network.

- [ ] **Step 4: Verify on two devices**

- [ ] Child uses an app, background task runs, parent sees that app named with a plausible check-in time.
- [ ] Turn the child's screen off for an hour: the parent sees "No check-in since…", not a stale app name presented as current.
- [ ] Airplane mode on the child: `connection` reads `NONE` and no crash follows on either side.
- [ ] The child's disclosure banner still names everything now being shared, context included. If it does not, Task 28's list is out of date and this task is not done.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: device context heartbeat with explicit check-in times"
```

---

# Phase 11 — Alerts and requests

Optional. Phases 8–10 deliver the feature; this phase makes the parent's device speak first. Build it only if the family list is being opened often enough to be a chore.

---

### Task 32: Parent-side alerts on a child's usage

Reuses `limitStatus`, `detectSpike`, `decideAlert` and `notify` unchanged. The only new code is fetching someone else's numbers and namespacing the alert keys.

**Files:**
- Modify: `src/features/limits/backgroundCheck.ts`, `src/features/limits/alerts.ts`
- Modify: `src/features/usage/settings.ts` (per-child limits), `src/i18n/*`

**Interfaces:**
- Produces: `Settings.childLimits: Record<string, { mobileLimitBytes: number | null; warnAtPercent: number }>`, keyed by `deviceId`

- [ ] **Step 1: Extend the alert keys**

`limitAlertKey` and `spikeAlertKey` currently identify one device's cycle. Prefix a `deviceId` (empty string for this device) so a parent watching three children keeps three independent once-per-threshold records in the one `alertedKeys` array. Extend `alerts.test.ts` to prove two devices crossing the same threshold in the same cycle produce two notifications, and that each still fires only once.

- [ ] **Step 2: Check children in `runUsageCheck`**

When `familyRole === 'parent'`, after the local checks: pull, and for each child with a configured limit, sum its `daily` payloads across the current cycle plus its `recent` total for today, then run the existing `limitStatus` against it.

Two honesty rules:

1. **Never alert on data older than 3 hours.** A child that has not checked in has not necessarily stopped using data; alerting from stale totals says something false about the present.
2. **Notify when a child goes quiet for 24 hours**, once. That is the honest version of the wishlist's "tamper watchdog" — it reports an observation ("no check-in since yesterday"), not an accusation, and it does not fire on the ordinary overnight Doze gap.

- [ ] **Step 3: Per-child limit UI**

A limit field on the child's detail screen, storing into `childLimits[deviceId]`. Reuse `LimitCard`.

**The copy must not imply enforcement.** *"Notify me when Leo passes 2 GB"* — never *"Limit Leo to 2 GB"*. Nothing in this app can stop the child's traffic, and a settings screen that suggests otherwise is the single worst outcome of this plan.

- [ ] **Step 4: Verify on two devices**

- [ ] Set a low limit for the child, generate traffic on the child, force both background runs: the parent gets exactly one notification.
- [ ] Force the parent's run again: no second notification for the same threshold.
- [ ] A second child crossing the same threshold in the same cycle produces its own notification.
- [ ] Kill the child's sync for 4 hours, then set a limit already exceeded by the stale data: **no alert fires**.
- [ ] The parent's own limits still alert exactly as they did in Phase 3.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: parent notifications for a child's usage thresholds"
```

---

### Task 33: "Ask for more data"

The wishlist framed this as the child requesting more of an enforced quota. There is no enforced quota. What is real: the child has a **local** limit from Phase 3, and the parent can raise it remotely. That is the version worth building.

**Files:**
- Modify: `src/features/family/sync.ts`, `src/features/limits/backgroundCheck.ts`
- Create: `src/features/family/RequestCard.tsx`
- Modify: `src/app/family/[deviceId].tsx`, `src/i18n/*`

- [ ] **Step 1: Child writes a `request`**

A button on the child's `LimitCard`, enabled when the local limit is in `warn` or `over`. Pushes `kind: 'request'` with `{ askedBytes, at }`. One outstanding request per device — the primary key upserts, so a second tap replaces the first rather than queueing.

- [ ] **Step 2: Parent sees and answers it**

`runUsageCheck` on the parent notifies on a new `request`. The child's detail screen shows *Grant* / *Decline*, writing `kind: 'grant'` with `{ grantedBytes, at, requestAt }`. `requestAt` is what makes an old grant identifiable as stale.

- [ ] **Step 3: Child applies it**

On the next sync, a `grant` whose `requestAt` matches the outstanding request raises `mobileLimitBytes` by `grantedBytes` and clears the request. A grant already applied is ignored — match on `requestAt`, not on presence, or a lingering row raises the limit on every cycle forever.

`ponytail: the grant row stays until the next unpair or the 90-day prune. Applied-ness is tracked locally by requestAt. Fine for one outstanding request per device; needs a server-side ack if this ever queues.`

- [ ] **Step 4: Verify on two devices**

- [ ] Child requests, parent is notified, parent grants, the child's limit rises by that amount within one cycle.
- [ ] Force three more child syncs: the limit rises **once**, not four times.
- [ ] Decline leaves the child's limit untouched and clears the request.
- [ ] Unpair mid-request: nothing is left behind on either device.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: child limit-increase requests and parent grants"
```

---

# Release checklist

Everything in the Phase 3–7 release checklist still applies. These are additional, and the first three are gates, not suggestions.

- [ ] **The unpaired app makes zero network calls for this feature.** Watch the traffic on a fresh install through a full background cycle. If a request goes out before pairing, the feature is not shippable.
- [ ] **Delete works from both sides.** Unpair from the child, then from the parent, and confirm `family_pull` returns nothing after each. Confirm the token is rotated, not reused, if the same device pairs again.
- [ ] **The disclosure banner cannot be hidden.** Search the codebase for any prop, setting, or flag that suppresses `SharingBanner`. There must not be one.
- [ ] **No screen claims enforcement.** Read every family string in `en.ts` and `ar.ts`. Nothing may say block, pause, restrict, or limit-as-a-verb. Alerting is what this ships.
- [ ] **No screen claims live.** Every value from a `recent` payload carries a check-in time, and nothing says "currently" or "now".
- [ ] **Stale data never becomes a zero.** Missing days are gaps; a missing heartbeat is "no check-in", not 0 MB.
- [ ] **Arabic and RTL.** Run the whole family flow in Arabic. `ar.ts` is checked against `en.ts`, so a missing key is a failure, not a silent English fallback.
- [ ] **Two Android versions, two manufacturers.** Aggressive battery management on Samsung/Xiaomi is the most likely cause of a child that never checks in — note the observed behaviour in the release rather than assuming the 15-minute cadence holds.
- [ ] **Airplane mode on each side.** Neither device may lose local functionality because sync failed.
- [ ] **Payload size.** Confirm a real `daily` payload is single-digit KB. A child on a metered plan is paying for this.
- [ ] `npx jest` passes. `npx tsc --noEmit` passes.
- [ ] `README.md` and the in-app privacy card agree with §Privacy, word for word on the "what leaves" list.

---

## Deliberately not built

The table at the top of this plan is the authoritative list — remote enforcement, per-app live speed, hourly heatmaps, realtime channels, E2EE, accounts, and tamper watchdogs are all out, each for a stated reason. Two more, specific to what was built here:

- **QR pairing.** The share sheet does the job with no camera permission. Add `expo-camera` only if the token must never exist inside a chat thread.
- **Web push / a parent web dashboard.** Would need real auth, which is the line this plan is built to stay behind.

## If this ever becomes a product

Everything above assumes a family sideloading an APK onto devices they own. A public release changes the calculus completely — Play's parental-control and stalkerware policies, a real privacy policy, per-user auth, an operator who can read every row, and data-subject requests. **That is a different project again**, and this plan's shape — a bearer token, an anon key, one shared table — is not the foundation for it.
