package expo.modules.networkusage

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class UsageQuery : Record {
    @Field val start: Long = 0
    @Field val end: Long = 0
    @Field val network: String = "ALL" // MOBILE | WIFI | ALL
}

class SeriesQuery : Record {
    @Field val start: Long = 0
    @Field val end: Long = 0
    @Field val network: String = "ALL"
    @Field val bucketMs: Long = 3_600_000
    @Field val uid: Int? = null
}

/**
 * Wi-Fi only, so there is no `network` field: the per-network split exists
 * because Wi-Fi is the transport that has more than one network behind it.
 */
class WifiUsageQuery : Record {
    @Field val start: Long = 0
    @Field val end: Long = 0
}
