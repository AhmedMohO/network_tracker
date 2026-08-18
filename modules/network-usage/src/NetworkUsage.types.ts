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
  getDeviceCounters(): {
    mobileRx: number;
    mobileTx: number;
    totalRx: number;
    totalTx: number;
  };
  /** False when "install unknown apps" is off for this app (Android 8+). */
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): void;
  /** Opens the system installer for a downloaded APK. */
  installApk(fileUri: string): void;
};
