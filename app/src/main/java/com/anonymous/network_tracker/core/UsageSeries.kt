package com.anonymous.network_tracker.core

data class SeriesBin(
    val start: Long,
    val end: Long,
    val rxBytes: Long,
    val txBytes: Long,
    val isEstimated: Boolean = false
)

internal fun summarySeries(start: Long, end: Long, bucketMs: Long, cumulative: (Long) -> LongArray): List<SeriesBin> {
    require(end > start && bucketMs > 0) { "Invalid series range or bucket size" }
    require((end - start - 1) / bucketMs < 2000) { "Requested range needs more than 2000 bins" }
    val bins = ArrayList<SeriesBin>()
    var from = start
    while (from < end) {
        val to = from + minOf(bucketMs, end - from)
        val total = cumulative(to)
        bins.add(SeriesBin(from, to, total[0], total[1]))
        from = to
    }
    val final = bins.last()
    val revised = bins.zipWithNext().any { (a, b) -> b.rxBytes < a.rxBytes || b.txBytes < a.txBytes }
    var previousRx = 0L
    var previousTx = 0L
    return bins.map { point ->
        val rx = point.rxBytes.coerceIn(previousRx, final.rxBytes)
        val tx = point.txBytes.coerceIn(previousTx, final.txBytes)
        val bin = point.copy(rxBytes = rx - previousRx, txBytes = tx - previousTx, isEstimated = revised)
        previousRx = rx
        previousTx = tx
        bin
    }
}
