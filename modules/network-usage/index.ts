import { requireNativeModule } from "expo";
import type { NetworkUsageModule } from "./src/NetworkUsage.types";

export * from "./src/NetworkUsage.types";
export default requireNativeModule<NetworkUsageModule>("NetworkUsage");
