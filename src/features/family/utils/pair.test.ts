import { newPairToken, pairLink, parsePairLink } from "./pair";

describe("newPairToken", () => {
  it("is 32 hex characters", () => {
    expect(newPairToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 100 }, newPairToken));
    expect(tokens.size).toBe(100);
  });
});

describe("parsePairLink", () => {
  it("round-trips a link", () => {
    const token = newPairToken();
    expect(parsePairLink(pairLink(token, "Dad's phone"))).toEqual({
      token,
      label: "Dad's phone",
    });
  });

  it("survives a label with spaces and punctuation", () => {
    const token = newPairToken();
    const parsed = parsePairLink(pairLink(token, "Mum and Dad's Pixel"));
    expect(parsed?.label).toBe("Mum and Dad's Pixel");
  });

  it("rejects a link with no token", () => {
    expect(parsePairLink("nettrack://pair?label=x")).toBeNull();
  });

  it("rejects a token that is not 32 hex characters", () => {
    expect(parsePairLink("nettrack://pair?t=short&label=x")).toBeNull();
    expect(parsePairLink(`nettrack://pair?t=${"z".repeat(32)}&label=x`)).toBeNull();
  });

  it("rejects another scheme carrying the right shape", () => {
    expect(parsePairLink(`https://evil.test/pair?t=${"a".repeat(32)}`)).toBeNull();
  });

  it("rejects a nettrack link that is not the pair route", () => {
    expect(parsePairLink(`nettrack://update?t=${"a".repeat(32)}`)).toBeNull();
  });

  it("returns null rather than throwing on junk", () => {
    expect(parsePairLink("")).toBeNull();
    expect(parsePairLink("not a url at all")).toBeNull();
  });

  it("defaults a missing label rather than failing", () => {
    const token = "a".repeat(32);
    expect(parsePairLink(`nettrack://pair?t=${token}`)?.label).toBe("");
  });
});
