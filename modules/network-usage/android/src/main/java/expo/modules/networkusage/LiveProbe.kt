package expo.modules.networkusage

import android.net.TrafficStats

object LiveProbe {

    /**
     * Device-wide cumulative counters since boot. These still work for the
     * device as a whole; the per-UID variants have returned UNSUPPORTED for
     * other apps' UIDs since Android 7, which is why there is no per-app
     * equivalent here.
     */
    fun counters(): Map<String, Any?> = mapOf(
        "mobileRx" to TrafficStats.getMobileRxBytes(),
        "mobileTx" to TrafficStats.getMobileTxBytes(),
        "totalRx" to TrafficStats.getTotalRxBytes(),
        "totalTx" to TrafficStats.getTotalTxBytes()
    )
}
