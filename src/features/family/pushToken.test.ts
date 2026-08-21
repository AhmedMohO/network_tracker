// `@/features/usage/settings` pulls in expo-sqlite/kv-store, which jest-expo
// does not mock — mocked here the same way `useFamily.test.ts` mocks it.
jest.mock("@/features/usage/settings", () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));
jest.mock("./sync", () => ({ rpc: jest.fn() }));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "proj" } } } },
}));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import * as Notifications from "expo-notifications";

import { loadSettings, saveSettings } from "@/features/usage/settings";

import { registerPushToken } from "./pushToken";
import { rpc } from "./sync";

const asMock = (fn: unknown) => fn as jest.Mock;

const TOKEN = "ExponentPushToken[abc123]";
const PAIRED = { pairToken: "t".repeat(32), deviceId: "d1", pushToken: null };

beforeEach(() => {
  asMock(loadSettings).mockReset().mockResolvedValue(PAIRED);
  asMock(saveSettings).mockReset().mockResolvedValue(undefined);
  asMock(rpc).mockReset().mockResolvedValue(null);
  asMock(Notifications.getPermissionsAsync).mockReset().mockResolvedValue({ granted: true });
  asMock(Notifications.getExpoPushTokenAsync).mockReset().mockResolvedValue({ data: TOKEN });
});

describe("registerPushToken", () => {
  it("registers the token and remembers it", async () => {
    await registerPushToken();
    expect(rpc).toHaveBeenCalledWith("family_register_token", {
      p_token: "t".repeat(32),
      p_device: "d1",
      p_push: TOKEN,
    });
    expect(saveSettings).toHaveBeenCalledWith({ pushToken: TOKEN });
  });

  it("does nothing when the device is not paired", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null, deviceId: null });
    await registerPushToken();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not ask for a token when notifications were declined", async () => {
    asMock(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false });
    await registerPushToken();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips the RPC when the stored token already matches", async () => {
    asMock(loadSettings).mockResolvedValue({ ...PAIRED, pushToken: TOKEN });
    await registerPushToken();
    expect(rpc).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("re-registers when the token has changed since last time", async () => {
    asMock(loadSettings).mockResolvedValue({ ...PAIRED, pushToken: "ExponentPushToken[old]" });
    await registerPushToken();
    expect(rpc).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ pushToken: TOKEN });
  });

  // The failure that matters: remembering a token the server never got would
  // make every later attempt short-circuit, leaving the device unreachable.
  it("does not remember the token when the RPC fails", async () => {
    asMock(rpc).mockRejectedValue(new Error("network down"));
    await expect(registerPushToken()).rejects.toThrow("network down");
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("gives up quietly when no token can be issued", async () => {
    asMock(Notifications.getExpoPushTokenAsync).mockRejectedValue(new Error("no FCM"));
    await expect(registerPushToken()).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});
