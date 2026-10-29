import { en } from "@/i18n/en";

import { WIFI_PROBLEM_KEY } from "./wifiProblem";

/**
 * `ar.ts` is typed against `en.ts`, so a locale missing a key is already a
 * build error. What nothing catches is a key that exists in neither: i18next
 * echoes the key back, and the one line explaining why per-network tracking is
 * recording nothing would render as `wifiNetworks.problemBackground`.
 */
describe("wifi watch problem messages", () => {
  const resolve = (path: string) =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );

  it.each(Object.entries(WIFI_PROBLEM_KEY))(
    "%s has a message",
    (_code, key) => {
      expect(typeof resolve(key)).toBe("string");
    },
  );

  it("has a label for the button that opens the fix", () => {
    expect(typeof resolve("wifiNetworks.problemFix")).toBe("string");
  });
});
