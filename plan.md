> **Status:** architecture reference. The executable plan is
> [`docs/plans/2026-08-18-network-usage-foundation.md`](docs/plans/2026-08-18-network-usage-foundation.md),
> which supersedes this document wherever the two disagree — see its
> "Corrections" table. Main departures: no SQLite mirror in the MVP,
> the local Expo module replaces `android/app/src/main/java/...`, live
> per-app monitoring is gated on a Phase 0 probe, and JS updates ship
> over the air via `expo-updates`.

Yes. Given your requirements, I would treat this as an **Android-first React Native network-monitoring application**, with Kotlin doing the system-level work and React Native doing the UI/business layer.

There is one important correction to the earlier plan: **we should not pretend that Android can give us arbitrary-second historical per-app data.** `NetworkStatsManager` stores usage in system-defined time buckets. Its detailed queries expose per-UID usage, RX/TX bytes, and timestamps, but Android explicitly says these buckets are not suitable for fine-grained time measurement. ([Android Developers][1])

So the architecture should combine:

1. **Android's historical network statistics** → authoritative historical data.
2. **Our own sampling/monitoring layer** → better live/current data.
3. **A local database** → normalized history for the UI.
4. **React Native** → dashboard, charts, filters, settings, export, etc.

---

# 1. Final architecture

```text
                         ┌─────────────────────────┐
                         │     React Native UI     │
                         │                         │
                         │ Dashboard               │
                         │ App Details             │
                         │ History                 │
                         │ Charts                  │
                         │ Limits                  │
                         │ Settings                │
                         └────────────┬────────────┘
                                      │
                              Native Bridge
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
             Kotlin Native Layer                 JS Business Layer
                    │                                   │
       ┌────────────┼────────────┐              Zustand / Services
       │            │            │
       ▼            ▼            ▼
 NetworkStats   Connectivity   PackageManager
 Manager        Manager
       │            │            │
       ▼            ▼            ▼
 Historical      Network       Installed Apps
 Usage           Type
       │
       ▼
 ┌─────────────────────────────────────────────────┐
 │              Local SQLite Database              │
 │                                                 │
 │ Usage Records                                   │
 │ Apps                                            │
 │ Network Sessions                                │
 │ Daily Aggregates                                │
 │ Settings                                        │
 └──────────────────────┬──────────────────────────┘
                        │
                        ▼
                  React Native UI
```

The key architectural decision is:

> **React Native never directly tries to understand Android's network statistics.**

Kotlin exposes a clean API such as:

```ts
getUsage({
	start,
	end,
	networkType: "MOBILE",
});
```

and returns normalized data.

---

# 2. Network types must be fundamental

I would define the domain model around this:

```text
NetworkType
│
├── MOBILE
│   ├── Download
│   ├── Upload
│   └── Total
│
├── WIFI
│   ├── Download
│   ├── Upload
│   └── Total
│
└── ALL
    ├── Download
    ├── Upload
    └── Total
```

Android's `NetworkStatsManager` accepts network types such as `ConnectivityManager.TYPE_MOBILE` and `TYPE_WIFI`, which is exactly what we want for separate mobile/Wi-Fi queries. ([Android Developers][2])

---

# 3. Data flow

Suppose the user requests:

> Mobile data used by YouTube from August 10 14:30 → August 17 21:00.

The flow should be:

```text
User
 │
 │ selects
 ▼
Mobile Data
Aug 10 14:30
       ↓
Aug 17 21:00
 │
 ▼
React Native
 │
 ▼
Native Bridge
 │
 ▼
Kotlin NetworkUsageManager
 │
 ├── networkType = MOBILE
 ├── start = ...
 ├── end = ...
 └── UID = YouTube UID
 │
 ▼
NetworkStatsManager
 │
 ▼
Android Network Statistics
 │
 ▼
Normalize buckets
 │
 ▼
SQLite
 │
 ▼
Aggregate requested range
 │
 ▼
React Native
 │
 ▼
Chart + numbers
```

---

# 4. Android's actual data model

A network bucket contains useful information such as:

```text
UID
startTimestamp
endTimestamp

rxBytes
txBytes

rxPackets
txPackets

state
metered
roaming
defaultNetwork
```

Android documents RX/TX as network-layer bytes and says the statistics include both TCP and UDP traffic. ([Android Developers][3])

So our internal model can normalize it to:

```ts
interface RawNetworkBucket {
	uid: number;

	startTime: number;
	endTime: number;

	rxBytes: number;
	txBytes: number;

	rxPackets: number;
	txPackets: number;

	state: NetworkState;
	metered: boolean;
	roaming: boolean;
}
```

Where:

```ts
type NetworkState = "ALL" | "FOREGROUND" | "DEFAULT";
```

Android provides `STATE_ALL`, `STATE_FOREGROUND`, and `STATE_DEFAULT`. ([Android Developers][3])

---

# 5. Our normalized usage model

Don't let Android's model leak throughout the application.

Create our own:

```ts
interface UsageRecord {
	id: string;

	uid: number;

	packageName: string;

	networkType: "MOBILE" | "WIFI";

	startTime: number;
	endTime: number;

	downloadBytes: number;
	uploadBytes: number;

	totalBytes: number;

	source: "ANDROID_STATS" | "LIVE_SAMPLE";

	isRoaming: boolean;
}
```

And:

```ts
totalBytes = downloadBytes + uploadBytes;
```

---

# 6. Database architecture

I'd use SQLite.

Something like:

```text
SQLite
│
├── apps
│
├── usage_records
│
├── usage_aggregates
│
├── network_sessions
│
├── data_limits
│
├── alerts
│
└── app_settings
```

---

# 7. `apps` table

```text
apps
────────────────────────────────
id
uid
package_name
app_name
version_name
version_code
icon_identifier
first_seen
last_seen
is_system_app
```

Example:

```text
1
10234
com.google.android.youtube
YouTube
21.12.4
...
```

Don't store the actual icon image repeatedly inside usage records.

---

# 8. `usage_records`

This is the important table.

```text
usage_records
─────────────────────────────────────
id
app_id
network_type
start_time
end_time

download_bytes
upload_bytes
total_bytes

source
is_roaming

created_at
updated_at
```

Example:

```text
id: 92832

app_id: 15

network_type: MOBILE

start_time:
2026-08-17 14:00

end_time:
2026-08-17 15:00

download_bytes:
182400000

upload_bytes:
8200000

total_bytes:
190600000

source:
ANDROID_STATS
```

---

# 9. Why we need `source`

This is important.

We will have two different sources.

```text
                    Usage Data
                        │
             ┌──────────┴──────────┐
             │                     │
       Android History          Live Sampling
             │                     │
      authoritative           near-real-time
             │                     │
             └──────────┬──────────┘
                        │
                        ▼
                  usage_records
```

Therefore:

```ts
source:
  | "ANDROID_STATS"
  | "LIVE_SAMPLE";
```

This lets us know where a number came from.

---

# 10. Historical data

For historical queries:

```text
Android
   │
   ▼
NetworkStatsManager
   │
   ├── MOBILE
   │
   └── WIFI
```

For each network type, query the selected interval.

For per-app usage, Android exposes `queryDetailsForUid`, while `queryDetails` can return details across UIDs belonging to the calling user. Accessing other apps' network statistics requires `PACKAGE_USAGE_STATS`, which the user grants through Settings. ([Android Developers][2])

This permission is therefore a **critical onboarding step**.

---

# 11. Permission architecture

On first launch:

```text
                  First Launch
                       │
                       ▼
              Explain permissions
                       │
                       ▼
            "Usage access required"
                       │
                       ▼
         Android Usage Access Settings
                       │
                       ▼
                User enables it
                       │
                       ▼
                 Return to app
                       │
                       ▼
                 Verify access
                       │
                 ┌─────┴─────┐
                 │           │
               YES           NO
                 │           │
                 ▼           ▼
              Continue    Explain again
```

The permission is not a normal runtime permission. Android documents `PACKAGE_USAGE_STATS` as a system-level permission that the user grants through Settings. ([Android Developers][2])

---

# 12. Connectivity detection

We also need to know the current network.

Use:

```text
ConnectivityManager
        │
        ▼
NetworkCapabilities
        │
 ┌──────┼────────┐
 ▼      ▼        ▼
Wi-Fi  Cellular  VPN
```

Android's `NetworkCapabilities` exposes transports including Wi-Fi, cellular, VPN, Ethernet, etc. ([Android Developers][4])

Our normalized model:

```ts
type CurrentNetwork =
	| {
			type: "WIFI";
			connected: true;
	  }
	| {
			type: "MOBILE";
			connected: true;
	  }
	| {
			type: "VPN";
			underlying?: "WIFI" | "MOBILE";
	  }
	| {
			type: "NONE";
			connected: false;
	  };
```

---

# 13. VPN is an important edge case

Suppose:

```text
Phone
  │
  ▼
VPN
  │
  ▼
Wi-Fi
```

Android can report multiple transports for a network, including VPN + Wi-Fi/mobile. ([Android Developers][5])

So we should **not simply say:**

```text
VPN = separate network
```

Instead, determine the underlying transport where possible and document how VPN traffic is attributed.

For MVP:

```text
Wi-Fi
Mobile
Other / VPN
```

could be the safest UI.

---

# 14. Historical query engine

Create a native service:

```text
NetworkUsageManager
```

with methods:

```kotlin
getUsage(
    networkType,
    startTime,
    endTime
)
```

and:

```kotlin
getAppUsage(
    uid,
    networkType,
    startTime,
    endTime
)
```

and:

```kotlin
getAllAppsUsage(
    networkType,
    startTime,
    endTime
)
```

---

# 15. Don't query every app individually

This is important for performance.

Bad:

```text
YouTube → query
Instagram → query
Chrome → query
WhatsApp → query
...
500 apps
```

Instead, where possible:

```text
NetworkStatsManager
       │
       ▼
queryDetails(
   MOBILE,
   start,
   end
)
       │
       ▼
all UID buckets
       │
       ▼
group by UID
       │
       ▼
Map UID → package
```

Android's `queryDetails` is designed to return detailed usage across UIDs and does not aggregate over time, UID, tag, metered, or roaming. ([Android Developers][1])

That becomes:

```text
Raw Android buckets
        │
        ▼
Group by UID
        │
        ▼
Resolve UID → package
        │
        ▼
Group by app
```

---

# 16. UID → App resolution

Android doesn't fundamentally think:

```text
YouTube
Chrome
Instagram
```

It thinks in terms of **UIDs**.

So:

```text
UID 10231
    ↓
PackageManager
    ↓
com.google.android.youtube
    ↓
YouTube
```

Some applications can share UIDs, so our data model should not blindly assume:

```text
1 UID = 1 package
```

The native layer should resolve the UID carefully.

---

# 17. Time-range problem

This is probably the most important technical limitation.

Imagine:

```text
User requests:

14:37:00
     ↓
16:12:00
```

But Android gives us:

```text
14:00 ───── 15:00
15:00 ───── 16:00
16:00 ───── 17:00
```

We **cannot legitimately pretend** that the 14:00–15:00 bucket can be accurately divided into:

```text
14:00–14:37
14:37–15:00
```

Android explicitly says detailed queries only include buckets that atomically occur in the interval and don't interpolate partial buckets; it also notes that bucket lengths are on the order of hours for some queries. ([Android Developers][1])

Therefore the UI needs a data-accuracy strategy.

---

# 18. Our time-range strategy

For every query, calculate:

```text
Requested Range
      │
      ▼
Available Android Buckets
      │
      ├── Complete bucket
      │       ↓
      │     TRUSTED
      │
      └── Partial bucket
              ↓
          NOT EXACT
```

Then we have three possibilities.

### A. Exact available data

```text
Aug 10 10:00
      ↓
Aug 10 14:00
```

All available buckets match.

Show:

> **Data confidence: High**

### B. Partial boundary

```text
User:
10:37 → 14:20
```

System:

```text
10:00 → 11:00
11:00 → 12:00
12:00 → 13:00
13:00 → 14:00
14:00 → 15:00
```

We can show:

> Some usage at the boundaries cannot be precisely attributed to this custom range.

That's much more honest.

---

# 19. Our own live collector

For live monitoring:

```text
Foreground Service
        │
        ▼
Every N seconds
        │
        ▼
Collect current usage information
        │
        ▼
Calculate delta
        │
        ▼
SQLite
        │
        ▼
React Native
```

But **don't use a foreground service simply because we can**.

Android requires foreground services to be user-visible and has increasingly strict rules. Android 14 requires an appropriate FGS type, and Android 15 introduced additional restrictions/time limits for some types. ([Android Developers][6])

So we should first prototype whether our live-monitoring requirement can be achieved adequately using Android's network statistics and callbacks without keeping an unnecessary long-running service.

---

# 20. Live dashboard architecture

```text
                   Android
                      │
             Network statistics
                      │
                      ▼
               Native Monitor
                      │
                delta bytes
                      │
                      ▼
                 EventEmitter
                      │
                      ▼
              React Native
                      │
                      ▼
                Live Store
                      │
              ┌───────┴───────┐
              ▼               ▼
           Counter           Chart
```

Example event:

```ts
{
  timestamp: 1755469000000,

  networkType: "MOBILE",

  downloadBytesDelta: 524288,
  uploadBytesDelta: 65536,

  downloadRate: 524288,
  uploadRate: 65536
}
```

---

# 21. Live UI

```text
┌──────────────────────────────────┐
│          LIVE MONITOR            │
│                                  │
│          MOBILE DATA             │
│                                  │
│       ↓ 4.82 MB/s                │
│       ↑ 320 KB/s                 │
│                                  │
│       ─── LIVE GRAPH ───         │
│                                  │
│ YouTube                          │
│ ↓ 3.42 MB/s                      │
│                                  │
│ Chrome                           │
│ ↓ 820 KB/s                       │
│                                  │
│ Instagram                        │
│ ↓ 410 KB/s                       │
└──────────────────────────────────┘
```

---

# 22. But distinguish "live speed" from "usage"

This is critical.

### Usage

```text
YouTube:
500 MB
```

means:

> YouTube consumed 500 MB over a period.

### Speed

```text
YouTube:
4.2 MB/s
```

means:

> At this moment, traffic is approximately 4.2 MB/s.

They should be separate concepts.

---

# 23. Aggregation layer

The DB should contain raw-ish records.

The application should calculate:

```text
Raw records
     │
     ▼
Aggregation Engine
     │
 ┌───┼──────────┐
 ▼   ▼          ▼
Hour Day       Month
```

For example:

```ts
interface UsageSummary {
	downloadBytes: number;
	uploadBytes: number;
	totalBytes: number;

	mobile: NetworkSummary;
	wifi: NetworkSummary;

	byApp: AppUsage[];
}
```

---

# 24. AppUsage

```ts
interface AppUsage {
	appId: string;

	packageName: string;
	appName: string;

	downloadBytes: number;
	uploadBytes: number;
	totalBytes: number;

	percentage: number;
}
```

For mobile:

```ts
interface NetworkAppUsage extends AppUsage {
	networkType: "MOBILE" | "WIFI";
}
```

---

# 25. Dashboard API

React Native should receive something like:

```ts
const dashboard = await networkUsage.getDashboard({
	startTime,
	endTime,
	networkType: "MOBILE",
});
```

Response:

```ts
{
  period: {
    start: 1755400000000,
    end: 1755486400000
  },

  networkType: "MOBILE",

  total: {
    download: 2840000000,
    upload: 184000000,
    total: 3024000000
  },

  apps: [
    {
      packageName: "com.google.android.youtube",
      name: "YouTube",
      download: 1240000000,
      upload: 42000000,
      total: 1282000000,
      percentage: 42.4
    }
  ]
}
```

This keeps React Native clean.

---

# 26. Dashboard screens

I'd structure the application as:

```text
App
│
├── Onboarding
│
├── Dashboard
│
├── Live Monitor
│
├── Apps
│   ├── App List
│   └── App Details
│
├── History
│
├── Compare
│
├── Limits
│
├── Alerts
│
├── Export
│
└── Settings
```

---

# 27. Dashboard

```text
┌────────────────────────────────────┐
│ Network Usage             ⚙️       │
│                                    │
│ [ALL] [MOBILE] [WIFI]              │
│                                    │
│ Aug 17, 2026                       │
│                                    │
│       3.02 GB                      │
│       Total                        │
│                                    │
│ ↓ 2.84 GB     ↑ 184 MB             │
│                                    │
│ ──────── Usage ─────────            │
│                                    │
│ 00   04   08   12   16   20   24  │
│                                    │
│ Top Apps                            │
│                                    │
│ YouTube             1.28 GB        │
│ Instagram             820 MB       │
│ Chrome                410 MB       │
└────────────────────────────────────┘
```

---

# 28. Date selector

The date selector should be powerful.

```text
Quick ranges:

Today
Yesterday
Last 24 hours
Last 7 days
Last 30 days
This month
Previous month
Custom
```

Custom:

```text
FROM

Date: 17 Aug 2026
Time: 14:37

TO

Date: 17 Aug 2026
Time: 22:18
```

---

# 29. Network filter

Make it globally available:

```text
┌───────────────┐
│ ALL           │
│ MOBILE DATA   │
│ WI-FI         │
└───────────────┘
```

The selected filter should affect:

- Total
- Chart
- Apps
- Rankings
- Comparison
- Export

---

# 30. App detail

```text
┌───────────────────────────────┐
│ ← YouTube                     │
│                               │
│ [Mobile] [Wi-Fi]              │
│                               │
│ 1.28 GB                        │
│ Total                          │
│                               │
│ ↓ 1.24 GB                      │
│ ↑ 42 MB                        │
│                               │
│ Usage                          │
│                               │
│ █                              │
│ █       █                      │
│ █ █     █                      │
│ █ █ █ █ █ █                    │
│ ─────────────────────          │
│                               │
│ Peak usage                     │
│ 18:42                          │
└───────────────────────────────┘
```

---

# 31. Comparison

This should become a strong feature.

```text
Compare

[This week]
       VS
[Last week]
```

Result:

```text
TOTAL MOBILE DATA

This week
8.42 GB

Last week
6.21 GB

             ↑ 35.4%
```

Then:

```text
App              Change

YouTube          +52%
Instagram        +18%
Chrome           -12%
WhatsApp          +4%
```

---

# 32. Data limits

Database:

```text
data_limits
──────────────────────────
id
network_type
period
limit_bytes
warning_percentage
enabled
```

Example:

```text
MOBILE
MONTHLY
10 GB
80%
```

Then:

```text
Used:
6.8 GB

Remaining:
3.2 GB

68%
```

---

# 33. Alerts

```text
alerts
────────────────────────
id
type
network_type
threshold
enabled
created_at
```

Types:

```ts
type AlertType =
	| "LIMIT_WARNING"
	| "LIMIT_REACHED"
	| "APP_HIGH_USAGE"
	| "DATA_SPIKE";
```

---

# 34. Data spike algorithm

Don't overcomplicate MVP.

Initially:

```text
current usage
      │
      ▼
Compare with historical average
      │
      ▼
Is current usage > X?
      │
 ┌────┴────┐
NO         YES
 │           │
 ▼           ▼
normal     spike
```

For example:

```text
Current hourly usage:
1.2 GB

Historical average:
180 MB

ratio:
6.67x
```

Trigger:

> 🚨 Unusual mobile data usage detected.

Later you can implement proper anomaly detection.

---

# 35. Export architecture

```text
React Native
     │
     ▼
Export Service
     │
 ┌───┴─────┐
 ▼         ▼
CSV       JSON
 │         │
 └────┬────┘
      ▼
 Android Share Sheet
```

CSV:

```text
timestamp,app,network,download,upload,total
2026-08-17 14:00,YouTube,MOBILE,120MB,8MB,128MB
2026-08-17 15:00,Chrome,WIFI,80MB,4MB,84MB
```

---

# 36. Important: don't mix mobile and Wi-Fi records

Never do this:

```text
usage_records
---------------------
app
timestamp
bytes
```

because later you can't reliably answer:

> How much was mobile?

Instead:

```text
usage_records
---------------------
app
timestamp
network_type
download
upload
```

Then:

```text
             usage_records
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
     MOBILE                  WIFI
        │                     │
        ▼                     ▼
 Mobile dashboard         Wi-Fi dashboard
```

---

# 37. Android native module structure

I'd create something approximately like:

```text
android/app/src/main/java/.../networkusage/

NetworkUsagePackage.kt

NetworkUsageModule.kt

NetworkUsageManager.kt

NetworkStatsReader.kt

NetworkTypeResolver.kt

AppResolver.kt

UsageAggregator.kt

LiveUsageMonitor.kt

UsageDatabase.kt
```

Responsibilities:

```text
NetworkUsageModule
        │
        │ React Native bridge
        ▼
NetworkUsageManager
        │
        ├── NetworkStatsReader
        ├── AppResolver
        ├── NetworkTypeResolver
        └── LiveUsageMonitor
```

---

# 38. React Native structure

I'd use:

```text
src/
│
├── app/
│
├── components/
│
├── screens/
│   ├── Dashboard/
│   ├── Live/
│   ├── Apps/
│   ├── History/
│   ├── Compare/
│   ├── Limits/
│   └── Settings/
│
├── services/
│   ├── networkUsage.ts
│   ├── permissions.ts
│   ├── updater.ts
│   └── export.ts
│
├── store/
│   ├── dashboardStore.ts
│   ├── settingsStore.ts
│   └── liveStore.ts
│
├── database/
│
├── hooks/
│
├── types/
│
└── utils/
```

---

# 39. Native bridge

Expose a small API:

```ts
NetworkUsage.getPermissionStatus();

NetworkUsage.requestUsageAccess();

NetworkUsage.getCurrentNetwork();

NetworkUsage.getUsage();

NetworkUsage.getAppUsage();

NetworkUsage.getAppsUsage();

NetworkUsage.startLiveMonitoring();

NetworkUsage.stopLiveMonitoring();

NetworkUsage.exportUsage();
```

And events:

```ts
NetworkUsage.on("usageUpdate", callback);
```

---

# 40. Don't make the bridge too complicated

React Native shouldn't know about:

```text
NetworkStats.Bucket
NetworkStatsManager
UID
subscriberId
ConnectivityManager
```

That's all Android implementation detail.

React Native should only see:

```ts
{
  networkType: "MOBILE",
  app: "YouTube",
  downloadBytes: 123456,
  uploadBytes: 4567,
  totalBytes: 128023
}
```

---

# 41. Accuracy architecture

I'd explicitly introduce an accuracy state.

```ts
type DataConfidence = "EXACT" | "SYSTEM_BUCKET" | "ESTIMATED" | "LIVE";
```

Then:

```text
Historical Android data
        ↓
SYSTEM_BUCKET

Our live measurements
        ↓
LIVE

Boundary estimation
        ↓
ESTIMATED
```

The UI can say:

```text
ⓘ Based on Android system usage buckets
```

instead of misleading the user.

---

# 42. This is especially important for your "complete freedom" requirement

You said:

> "user must have complete freedom about the time period he wants"

I would interpret that as:

**The UI must allow arbitrary timestamps.**

Not:

**We must falsely claim arbitrary timestamp accuracy.**

So:

```text
                    Custom Range
                         │
                         ▼
                Can Android provide
                exact data here?
                    /          \
                  YES           NO
                   │             │
                   ▼             ▼
                Exact       Best available
                             system data
                                  │
                                  ▼
                         Explain limitation
```

This is much more technically defensible.

---

# 43. Live vs historical

I'd make the distinction visually obvious.

### Historical

```text
📊 HISTORY

Aug 17
14:00 → 22:00

Mobile
3.2 GB
```

### Live

```text
🔴 LIVE

Mobile

↓ 4.2 MB/s
↑ 280 KB/s
```

Don't mix them.

---

# 44. Background monitoring

This needs careful Android testing.

A long-running foreground service is possible for appropriate user-visible use cases, but Android has restrictions around foreground services, including required service types on Android 14+ and additional restrictions in Android 15. ([Android Developers][6])

Therefore I'd make this a separate milestone:

```text
Phase 1
Historical statistics

        ↓

Phase 2
Live monitoring prototype

        ↓

Phase 3
Background persistence

        ↓

Phase 4
Battery optimization testing
```

Don't build the whole application around a foreground service before validating it.

---

# 45. Battery strategy

We don't want:

```text
Every 100 ms
    ↓
Read stats
    ↓
SQLite
    ↓
React Native
```

That's terrible.

Instead:

```text
Android Native
      │
      ▼
Collect efficiently
      │
      ▼
Aggregate
      │
      ▼
Write batches
      │
      ▼
SQLite
      │
      ▼
RN UI
```

And for the UI:

```text
Native updates
     ↓
500ms–2s UI refresh
```

depending on what the prototype shows is practical.

---

# 46. Database indexing

Since your primary queries are:

```text
app + time
network + time
network + app + time
```

indexes should reflect that.

For example:

```sql
CREATE INDEX idx_usage_network_time
ON usage_records(network_type, start_time);

CREATE INDEX idx_usage_app_time
ON usage_records(app_id, start_time);

CREATE INDEX idx_usage_app_network_time
ON usage_records(app_id, network_type, start_time);
```

This will matter once you've accumulated months of data.

---

# 47. Storage strategy

Don't store every UI calculation.

Store:

```text
Raw/system records
```

and calculate:

```text
daily
weekly
monthly
custom
```

when needed.

Later, if performance becomes an issue:

```text
Raw data
   ↓
Aggregation job
   ↓
Hourly aggregates
   ↓
Daily aggregates
```

Then:

```text
30-day chart
```

doesn't scan millions of raw records.

---

# 48. Suggested database evolution

### MVP

```text
usage_records
```

### v1

```text
usage_records
hourly_usage
daily_usage
```

### v2

```text
usage_records
5min_usage
hourly_usage
daily_usage
monthly_usage
```

But don't prematurely create all of these.

---

# 49. Update system

Since you're not publishing through Play Store/App Store, I'd use:

```text
GitHub Releases
        │
        ▼
latest.json
        │
        ▼
App
        │
        ▼
Compare versions
```

For example:

```json
{
	"version": "1.2.0",
	"minimumVersion": "1.0.0",
	"apkUrl": "...",
	"releaseNotes": ["Improved live monitoring", "Fixed Wi-Fi calculation"]
}
```

Then:

```text
Current: 1.1.0
Latest:  1.2.0

        ↓

Update available

[View changes]

[Download update]
```

---

# 50. Update architecture

```text
                App startup
                     │
                     ▼
              UpdateChecker
                     │
                     ▼
             GitHub / API
                     │
              ┌──────┴──────┐
              │             │
           Current         New
              │             │
              ▼             ▼
             Done       Show update
                            │
                            ▼
                       Download APK
                            │
                            ▼
                    Android Installer
                            │
                            ▼
                       User confirms
                            │
                            ▼
                         Updated
```

I would **not** implement a custom OTA JavaScript update system initially. Your native Android module is part of the application, so APK-based updates are much safer.

---

# 51. MVP development phases

## Phase 0 — Android feasibility prototype

**Do this first.**

Build a tiny Kotlin application.

Test:

```text
✓ PACKAGE_USAGE_STATS
✓ NetworkStatsManager
✓ MOBILE
✓ WIFI
✓ Per UID
✓ RX bytes
✓ TX bytes
✓ timestamps
✓ multiple Android versions
```

Goal:

```text
YouTube
Mobile
1.24 GB
↓
42 MB
↑
```

If this works reliably, proceed.

---

# 52. Phase 1 — Native data engine

Build:

```text
NetworkStatsReader
AppResolver
NetworkTypeResolver
UsageAggregator
```

Implement:

```text
getMobileUsage()
getWifiUsage()
getAllAppsUsage()
getAppUsage()
```

No fancy UI yet.

---

# 53. Phase 2 — SQLite

Implement:

```text
apps
usage_records
network_sessions
settings
```

Then:

```text
Android
 ↓
NetworkStatsManager
 ↓
Normalize
 ↓
SQLite
```

Test queries extensively.

---

# 54. Phase 3 — React Native bridge

Expose:

```text
getUsage()
getAppUsage()
getAppsUsage()
getCurrentNetwork()
```

Test from React Native.

---

# 55. Phase 4 — Dashboard

Build:

```text
Dashboard
 ├── Mobile
 ├── Wi-Fi
 ├── All
 ├── Download
 ├── Upload
 ├── Total
 ├── Graph
 └── Top Apps
```

---

# 56. Phase 5 — Custom ranges

Implement:

```text
Date
Time
Timezone
Start
End
```

Then:

```text
Custom Range
      ↓
Query Engine
      ↓
Accuracy calculation
      ↓
Result
```

This is where we should carefully test Android's bucket behavior.

---

# 57. Phase 6 — App details

```text
Apps
 ↓
YouTube
 ↓
Mobile / Wi-Fi
 ↓
Usage
 ↓
Chart
```

---

# 58. Phase 7 — Live monitoring

Prototype:

```text
Live monitor
     ↓
Native monitoring
     ↓
Events
     ↓
React Native
```

Then test:

- screen off
- screen on
- app minimized
- app killed
- Wi-Fi → mobile
- mobile → Wi-Fi
- airplane mode
- VPN
- reboot
- battery saver

---

# 59. Phase 8 — Limits and alerts

Implement:

```text
Monthly limit
Daily limit
Warning %
App threshold
Data spike
```

---

# 60. Phase 9 — Export

Implement:

```text
CSV
JSON
Share
```

PDF can come later.

---

# 61. Phase 10 — Update system

Implement:

```text
Version check
 ↓
Changelog
 ↓
APK download
 ↓
Android installer
```

---

# 62. Testing matrix

This app needs **much more device testing than a normal React Native app**.

Test:

```text
Android 10
Android 11
Android 12
Android 13
Android 14
Android 15
Android 16
```

And manufacturers:

```text
Google Pixel
Samsung
Xiaomi
Huawei
OnePlus
OPPO
```

Especially because background execution and battery-management behavior can vary.

---

# 63. Network transition tests

Absolutely test:

```text
Wi-Fi
  ↓
Mobile

Mobile
  ↓
Wi-Fi

Wi-Fi
  ↓
VPN

Mobile
  ↓
VPN

No network
```

You need to ensure we don't accidentally classify:

```text
Mobile = Wi-Fi
```

or double-count traffic.

---

# 64. The complete data architecture

Here's the architecture I'd ultimately aim for:

```text
                         ANDROID
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
    NetworkStatsManager ConnectivityManager PackageManager
            │               │                │
            │               │                │
            ▼               ▼                ▼
      Historical       Current network     App metadata
        usage               type                │
            │               │                   │
            └───────────────┼───────────────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │ Native Normalizer │
                  └─────────┬─────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
      Historical Records             Live Records
              │                           │
              └─────────────┬─────────────┘
                            ▼
                     SQLite Database
                            │
                  ┌─────────┴─────────┐
                  │                   │
                  ▼                   ▼
            Query Engine         Aggregation
                  │                   │
                  └─────────┬─────────┘
                            ▼
                     Native RN Bridge
                            │
                            ▼
                    React Native Store
                            │
        ┌───────────┬───────┼────────┬───────────┐
        ▼           ▼       ▼        ▼           ▼
    Dashboard     Apps    Charts   Alerts     Settings
```

---

# 65. MVP feature priority

I'd rank the features like this:

| Priority | Feature                         |
| -------- | ------------------------------- |
| 🔴 P0    | Mobile/Wi-Fi separation         |
| 🔴 P0    | Per-app usage                   |
| 🔴 P0    | Download/upload                 |
| 🔴 P0    | Historical usage                |
| 🔴 P0    | Custom date/time range          |
| 🔴 P0    | Usage Access permission         |
| 🔴 P0    | Local database                  |
| 🔴 P0    | Dashboard                       |
| 🔴 P0    | App details                     |
| 🟠 P1    | Live monitoring                 |
| 🟠 P1    | Usage charts                    |
| 🟠 P1    | Mobile data limits              |
| 🟠 P1    | Notifications                   |
| 🟠 P1    | CSV/JSON export                 |
| 🟠 P1    | Period comparison               |
| 🟡 P2    | Data-spike detection            |
| 🟡 P2    | Background/foreground breakdown |
| 🟡 P2    | VPN analysis                    |
| 🟡 P2    | Advanced analytics              |
| 🟢 P3    | Cloud backup                    |
| 🟢 P3    | Accounts                        |
| 🟢 P3    | Multi-device                    |

---

# 66. One thing I would change from the original idea

I **wouldn't promise "complete accurate arbitrary historical periods"** in the product specification until the Kotlin prototype proves what Android exposes.

The product promise should instead be:

> **Detailed network usage by app, network type, upload/download, and customizable time ranges, using Android's system network statistics with clear indication of data granularity.**

That's technically honest.

Android itself says its network statistics are collected in discrete time buckets, and some detailed APIs aren't suitable for fine-grained time measurement. ([Android Developers][1])

Then our **live monitoring layer** can provide much finer-grained data going forward.

---

## The first milestone I'd build

Before touching the React Native UI, I'd make a **Kotlin Android "NetworkStats Explorer"** with only this screen:

```text
┌──────────────────────────────────────┐
│ NetworkStats Explorer                │
│                                      │
│ Permission:       ✅ Granted         │
│                                      │
│ ───── MOBILE ─────                   │
│                                      │
│ Start:  Aug 1                       │
│ End:    Aug 17                      │
│                                      │
│ Total:  12.42 GB                    │
│ RX:      11.2 GB                    │
│ TX:      1.22 GB                    │
│                                      │
│ ───── APPS ─────                     │
│                                      │
│ YouTube       UID 10234             │
│ RX: 3.2 GB                          │
│ TX: 180 MB                          │
│                                      │
│ Instagram     UID 10245             │
│ RX: 2.1 GB                          │
│ TX: 320 MB                          │
│                                      │
│ ───── WIFI ─────                     │
│                                      │
│ Total: 42.1 GB                      │
│ RX:    39.8 GB                      │
│ TX:     2.3 GB                      │
└──────────────────────────────────────┘
```

If this prototype produces numbers that agree with **Android Settings → Network/Internet → App data usage**, then we have validated the most important part of the project.

Only after that would I start building the React Native application around it.

### Sources

The key Android APIs for this architecture are [NetworkStatsManager](https://developer.android.com/reference/android/app/usage/NetworkStatsManager?utm_source=chatgpt.com), [NetworkStats.Bucket](https://developer.android.com/reference/android/app/usage/NetworkStats.Bucket?utm_source=chatgpt.com), and [ConnectivityManager / network state documentation](https://developer.android.com/develop/connectivity/network-ops/reading-network-state?utm_source=chatgpt.com). Android's current foreground-service restrictions are documented [here](https://developer.android.com/develop/background-work/services/fgs/changes?utm_source=chatgpt.com).

[1]: https://developer.android.com/reference/android/app/usage/NetworkStatsManager?utm_source=chatgpt.com "NetworkStatsManager  |  API reference  |  Android Developers"
[2]: https://developer.android.com/reference/android/app/usage/NetworkStatsManager.html?utm_source=chatgpt.com "NetworkStatsManager  |  API reference  |  Android Developers"
[3]: https://developer.android.com/reference/android/app/usage/NetworkStats.Bucket?utm_source=chatgpt.com "NetworkStats.Bucket  |  API reference  |  Android Developers"
[4]: https://developer.android.com/reference/kotlin/android/net/NetworkCapabilities.html?utm_source=chatgpt.com "NetworkCapabilities  |  API reference  |  Android Developers"
[5]: https://developer.android.com/develop/connectivity/network-ops/reading-network-state?hl=en&utm_source=chatgpt.com "Read network state  |  Connectivity  |  Android Developers"
[6]: https://developer.android.com/about/versions/14/changes/fgs-types-required?authuser=002&hl=en&utm_source=chatgpt.com "Foreground service types are required  |  Android Developers"
