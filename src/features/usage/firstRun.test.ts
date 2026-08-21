// `./settings` pulls in expo-sqlite/kv-store, which jest-expo does not mock —
// mocked here the same way `sync.test.ts` and `useFamily.test.ts` mock it.
jest.mock("./settings", () => ({ loadSettings: jest.fn(), saveSettings: jest.fn() }));
jest.mock("./api", () => ({ hasUsageAccess: jest.fn() }));
jest.mock("./wifiNetworks", () => ({
  enableWifiWatch: jest.fn(),
  isWifiWatchEnabled: jest.fn(),
}));
jest.mock("@/features/limits/keepAlive", () => ({
  isBatteryOptimized: jest.fn(),
  requestIgnoreBatteryOptimizations: jest.fn(),
  setSyncKeepAliveEnabled: jest.fn(),
}));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import {
  isBatteryOptimized,
  requestIgnoreBatteryOptimizations,
  setSyncKeepAliveEnabled,
} from "@/features/limits/keepAlive";

import { hasUsageAccess } from "./api";
import { runFirstTimeSetup } from "./firstRun";
import { loadSettings, saveSettings } from "./settings";
import { enableWifiWatch } from "./wifiNetworks";

const asMock = (fn: unknown) => fn as jest.Mock;

beforeEach(() => {
  asMock(loadSettings).mockReset().mockResolvedValue({ firstRunDoneAt: null });
  asMock(saveSettings).mockReset().mockResolvedValue(undefined);
  asMock(hasUsageAccess).mockReset().mockReturnValue(true);
  asMock(enableWifiWatch).mockReset().mockResolvedValue(true);
  asMock(setSyncKeepAliveEnabled).mockReset();
  asMock(isBatteryOptimized).mockReset().mockReturnValue(true);
  asMock(requestIgnoreBatteryOptimizations).mockReset();
});

describe("runFirstTimeSetup", () => {
  it("turns background updates on, asks for the exemption, and stamps", async () => {
    await runFirstTimeSetup();
    expect(setSyncKeepAliveEnabled).toHaveBeenCalledWith(true);
    expect(requestIgnoreBatteryOptimizations).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ firstRunDoneAt: expect.any(Number) }),
    );
  });

  // The whole point of this test: per-network tracking costs a location
  // permission, and asking for one on first launch is how it gets denied for
  // good. It is opt-in from Settings and nothing here may pre-empt that.
  it("never touches the Wi-Fi watch", async () => {
    await runFirstTimeSetup();
    expect(enableWifiWatch).not.toHaveBeenCalled();
  });

  it("does nothing at all once it has run", async () => {
    asMock(loadSettings).mockResolvedValue({ firstRunDoneAt: 1 });
    await runFirstTimeSetup();
    expect(setSyncKeepAliveEnabled).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  // The retry path: on a fresh install this runs before the user has granted
  // usage access, and must leave itself armed for the next foreground.
  it("defers without stamping until usage access is granted", async () => {
    asMock(hasUsageAccess).mockReturnValue(false);
    await runFirstTimeSetup();
    expect(setSyncKeepAliveEnabled).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("skips the battery dialog when Android already exempted the app", async () => {
    asMock(isBatteryOptimized).mockReturnValue(false);
    await runFirstTimeSetup();
    expect(requestIgnoreBatteryOptimizations).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalled();
  });
});
