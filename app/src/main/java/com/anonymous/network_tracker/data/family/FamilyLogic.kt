package com.anonymous.network_tracker.data.family

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.SecureRandom
import java.time.OffsetDateTime
import com.anonymous.network_tracker.data.util.RangeUtils

internal fun familyDaysToUpload(now: Long, uploaded: Set<Long>): List<Long> =
    (1..30).map { RangeUtils.midnight(now, -it) }.filterIndexed { index, day -> index == 0 || day !in uploaded }

data class Pairing(val token: String, val label: String)
private val TOKEN = Regex("[0-9a-f]{32}")

fun newFamilyId(): String = ByteArray(16).also { SecureRandom().nextBytes(it) }
    .joinToString("") { "%02x".format(it.toInt() and 255) }

fun pairLink(token: String, label: String): String {
    require(TOKEN.matches(token)) { "Invalid pairing token" }
    return "nettrack://pair?t=$token&label=${URLEncoder.encode(label, "UTF-8") }"
}

fun parsePairLink(raw: String): Pairing? = runCatching {
    val uri = URI(raw.trim())
    if (uri.scheme != "nettrack" || (uri.host ?: uri.path.trimStart('/')) != "pair") return null
    val query = uri.rawQuery.orEmpty().split('&').associate {
        val pair = it.split('=', limit = 2)
        URLDecoder.decode(pair[0], "UTF-8") to URLDecoder.decode(pair.getOrElse(1) { "" }, "UTF-8")
    }
    val token = query["t"]?.takeIf(TOKEN::matches) ?: return null
    Pairing(token, query["label"].orEmpty())
}.getOrNull()

fun parseServerTimestamp(value: String): Long = OffsetDateTime.parse(value).toInstant().toEpochMilli()

data class GrantOutcome(val clearPending: Boolean, val apply: Boolean, val newLimitBytes: Long, val appliedRequestAt: Long)

fun applyGrant(grantedBytes: Long, requestAt: Long, pendingRequestAt: Long?, appliedRequestAt: Long?, currentLimit: Long?): GrantOutcome {
    require(grantedBytes >= 0 && requestAt > 0) { "Invalid grant" }
    val apply = requestAt != appliedRequestAt && grantedBytes > 0
    return GrantOutcome(requestAt == pendingRequestAt, apply,
        if (apply) Math.addExact(currentLimit ?: 0, grantedBytes) else currentLimit ?: 0, requestAt)
}
