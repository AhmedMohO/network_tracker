export type NetworkFilter = "MOBILE" | "WIFI" | "ALL";

export type UsageQuery = {
  start: number;
  end: number;
  network: NetworkFilter;
};

export type AppUsageRow = {
  uid: number;
  packages: string[];
  label: string | null;
  rxBytes: number;
  txBytes: number;
  rxForegroundBytes: number;
  txForegroundBytes: number;
  coveredStart: number;
  coveredEnd: number;
};

export type RawBucket = {
  networkType: number;
  uid: number;
  tag: number;
  state: number;
  metered: number | null;
  roaming: number;
  defaultNetwork: number | null;
  startTime: number;
  endTime: number;
  rxBytes: number;
  txBytes: number;
};

/**
 * One Wi-Fi network's slice of a range. `ssid` is `null` for bytes the
 * transition log has no opinion about — time before per-network tracking was
 * switched on, or a gap where the watch was not running. Those bytes are
 * reported rather than dropped so the per-network figures still sum to the
 * Wi-Fi total shown everywhere else.
 */
export type WifiNetworkUsage = {
  ssid: string | null;
  totalBytes: number;
  apps: AppUsageRow[];
};

export type WifiNetworkUsageResult = {
  networks: WifiNetworkUsage[];
  coveredStart: number;
  coveredEnd: number;
};

export type SeriesQuery = {
  start: number;
  end: number;
  network: NetworkFilter;
  bucketMs: number;
  uid?: number | null;
};

export type SeriesBin = {
  start: number;
  end: number;
  rxBytes: number;
  txBytes: number;
};

export type SeriesResult = {
  bins: SeriesBin[];
  coveredStart: number;
  coveredEnd: number;
};

/**
 * The shape the native module exposes. Declared here rather than inside
 * `index.ts` so the Android implementation and the off-Android stubs are
 * checked against one definition and cannot drift apart.
 */
export type NetworkUsageModule = {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  /** Opens the system App info screen, which hosts that app's data usage. */
  openAppDataUsageSettings(packageName: string): void;
  getAppUsage(q: UsageQuery): Promise<AppUsageRow[]>;
  /** Launcher icon as base64 PNG, or null when the package is not installed. */
  getAppIcon(packageName: string): Promise<string | null>;
  dumpBuckets(q: UsageQuery): Promise<RawBucket[]>;
  getSeries(q: SeriesQuery): Promise<SeriesResult>;
  /**
   * Wi-Fi usage split by network name. Approximate at bucket boundaries and
   * only as far back as the transition log goes — see the Kotlin
   * `appUsageByWifiNetwork` doc comment before trusting a figure to the byte.
   */
  getWifiNetworkUsage(q: { start: number; end: number }): Promise<WifiNetworkUsageResult>;
  isWifiWatchEnabled(): boolean;
  /**
   * Starts or stops the foreground service that records network changes.
   * Requesting `ACCESS_FINE_LOCATION` is the caller's job: without it the
   * watch still runs and simply records every network as unknown.
   */
  setWifiWatchEnabled(enabled: boolean): void;
  /**
   * Why the watch is recording nothing, or null when it is working. The switch
   * being on is not the same question: all three of these are revoked from
   * system screens, behind the app's back, and each one silently turns every
   * network into the unattributed bucket.
   *
   * - `permission` — no `ACCESS_FINE_LOCATION` (including "Approximate", which
   *   grants only `ACCESS_COARSE_LOCATION` and does not lift the redaction).
   * - `locationOff` — the device's location master switch is off.
   * - `background` — location is "while using the app", so the name is
   *   readable only while the app is on screen.
   */
  wifiWatchProblem(): "permission" | "locationOff" | "background" | null;
  /** Opens the system screen that fixes `wifiWatchProblem`. */
  openWifiWatchSettings(): void;
  /** Network names seen so far, newest first. */
  getKnownWifiNetworks(): string[];
  clearWifiSessions(): void;
  isSyncKeepAliveEnabled(): boolean;
  /**
   * Reliable background checks: arms an `AlarmManager` alarm that fires in
   * Doze and runs the registered background task, and brings the foreground
   * service up with it so App Standby does not defer that alarm. See the
   * Kotlin `SyncKeepAlive` for why WorkManager alone is not enough.
   */
  setSyncKeepAliveEnabled(enabled: boolean): void;
  /** False when Android is still free to defer this app's background work. */
  isIgnoringBatteryOptimizations(): boolean;
  /** Opens the system's one-tap exemption dialog. */
  requestIgnoreBatteryOptimizations(): void;
  getDeviceCounters(): {
    mobileRx: number;
    mobileTx: number;
    totalRx: number;
    totalTx: number;
  };
  getDeviceContext(): {
    foregroundPackage: string | null;
    batteryPercent: number | null;
    connection: "MOBILE" | "WIFI" | "NONE";
  };
  /** False when "install unknown apps" is off for this app (Android 8+). */
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): void;
  /** Opens the system installer for a downloaded APK. */
  installApk(fileUri: string): void;
};
