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
  metered: number;
  roaming: number;
  defaultNetwork: number;
  startTime: number;
  endTime: number;
  rxBytes: number;
  txBytes: number;
};
