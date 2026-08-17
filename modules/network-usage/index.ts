import { requireNativeModule } from "expo";

declare class NetworkUsageModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
}

export default requireNativeModule<NetworkUsageModule>("NetworkUsage");
