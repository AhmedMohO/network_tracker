import { requireNativeModule } from "expo";
import type { AppUsageRow, RawBucket, UsageQuery } from "./src/NetworkUsage.types";

declare class NetworkUsageModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  getAppUsage(q: UsageQuery): Promise<AppUsageRow[]>;
  dumpBuckets(q: UsageQuery): Promise<RawBucket[]>;
}

export * from "./src/NetworkUsage.types";
export default requireNativeModule<NetworkUsageModule>("NetworkUsage");
