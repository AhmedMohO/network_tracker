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
