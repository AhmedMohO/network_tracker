package com.anonymous.network_tracker.core

internal fun proportionalBytes(bytes: Long, from: Long, to: Long, span: Long): Long {
    require(bytes >= 0 && span > 0 && from in 0..span && to in from..span)
    val count = bytes.toBigInteger()
    val duration = span.toBigInteger()
    return (count * to.toBigInteger() / duration - count * from.toBigInteger() / duration).toLong()
}
