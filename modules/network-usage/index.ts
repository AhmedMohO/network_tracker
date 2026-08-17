import { requireNativeModule } from "expo";
import type {
  AppUsageRow,
  RawBucket,
  SeriesQuery,
  SeriesResult,
  UsageQuery,
} from "./src/NetworkUsage.types";

declare class NetworkUsageModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  getAppUsage(q: UsageQuery): Promise<AppUsageRow[]>;
  dumpBuckets(q: UsageQuery): Promise<RawBucket[]>;
  getSeries(q: SeriesQuery): Promise<SeriesResult>;
  getDeviceCounters(): {
    mobileRx: number;
    mobileTx: number;
    totalRx: number;
    totalTx: number;
  };
}

export * from "./src/NetworkUsage.types";
export default requireNativeModule<NetworkUsageModule>("NetworkUsage");
