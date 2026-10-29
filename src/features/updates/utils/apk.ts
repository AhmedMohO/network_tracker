export type ReleaseInfo = {
  version: string;
  notes: string;
  apkUrl: string | null;
};

function parse(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, "");
  // Deliberately strict: a pre-release or nightly tag has no defined ordering
  // against a plain version, so it is not parsed rather than guessed at.
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split(".").map(Number);
}

export function isNewerVersion(latestTag: string, currentVersion: string): boolean {
  const latest = parse(latestTag);
  const current = parse(currentVersion);
  // An unparseable tag must never be treated as an upgrade.
  if (!latest || !current) return false;

  const length = Math.max(latest.length, current.length);
  for (let i = 0; i < length; i++) {
    const a = latest[i] ?? 0;
    const b = current[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * The latest published release of `repo` ("owner/name"). This is the one place
 * the app talks to the network, and it sends nothing but the request itself.
 */
export async function fetchLatestRelease(repo: string): Promise<ReleaseInfo | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return null;

  const json = await response.json();
  const asset = (json.assets ?? []).find((a: { name: string }) => a.name.endsWith(".apk"));

  return {
    version: json.tag_name ?? "",
    notes: json.body ?? "",
    apkUrl: asset?.browser_download_url ?? null,
  };
}
