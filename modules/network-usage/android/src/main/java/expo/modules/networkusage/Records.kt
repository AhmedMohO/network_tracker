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
