import { useMemo } from "react";

import { billingCycleRange } from "@/features/usage/range";
import { useUsage } from "@/features/usage/useUsage";
import { useUsageContext } from "@/features/usage/useUsageContext";

import { limitStatus, type LimitStatus } from "./limits";

/**
 * A data limit is always about mobile data over the billing cycle, not
 * whatever range/filter the dashboard has selected — so this runs its own
 * query rather than reading `range`/`network` off the context.
 */
export function useLimitStatus(): LimitStatus | null {
  const { settings } = useUsageContext();
  const cycle = useMemo(
    () => billingCycleRange(settings?.cycleStartDay ?? 1, Date.now()),
    [settings?.cycleStartDay]
  );
  const { data } = useUsage(cycle, "MOBILE");

  if (!data || !settings?.mobileLimitBytes) return null;
  return limitStatus(
    data.totals.total,
    settings.mobileLimitBytes,
    cycle,
    Date.now(),
    settings.warnAtPercent
  );
}
