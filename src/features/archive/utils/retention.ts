/** Seven calendar months ago, at local midnight, clamped to the target month. */
export function historyCutoff(now = Date.now()): number {
  const today = new Date(now);
  const cutoff = new Date(today.getFullYear(), today.getMonth() - 7, 1);
  const lastDay = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(today.getDate(), lastDay));
  return cutoff.getTime();
}
