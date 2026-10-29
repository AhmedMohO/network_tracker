import { isNewerVersion } from "./apk";

describe("isNewerVersion", () => {
  it("compares semantic versions numerically, not as strings", () => {
    // String comparison would call "1.10.0" older than "1.9.0".
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
  });

  it("tolerates a leading v on the tag", () => {
    expect(isNewerVersion("v1.2.0", "1.1.0")).toBe(true);
  });

  it("is false for the same version", () => {
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
  });

  it("is false for an older tag", () => {
    expect(isNewerVersion("1.1.9", "1.2.0")).toBe(false);
  });

  it("treats a missing patch segment as zero", () => {
    expect(isNewerVersion("1.3", "1.2.9")).toBe(true);
    expect(isNewerVersion("1.2", "1.2.0")).toBe(false);
  });

  it("is false for an unparseable tag rather than prompting a bad update", () => {
    expect(isNewerVersion("nightly", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.2.0-beta", "1.1.0")).toBe(false);
  });
});
