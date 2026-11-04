package com.anonymous.network_tracker.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object SupabaseRpc {

    private const val BASE_URL = "https://nrnvjidwgverzmumttjd.supabase.co"
    private const val ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybnZqaWR3Z3ZlcnptdW10dGpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMDMxNzAsImV4cCI6MjEwMjY3OTE3MH0.1e7Dc5H__XHswr4JjuNggS1eIVEMT2acZEmhmiCf9bc"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    suspend fun rpc(name: String, body: JSONObject): String? = withContext(Dispatchers.IO) {
        val requestBody = body.toString().toRequestBody(JSON_MEDIA_TYPE)
        val request = Request.Builder()
            .url("$BASE_URL/rest/v1/rpc/$name")
            .header("apikey", ANON_KEY)
            .header("Content-Type", "application/json")
            .post(requestBody)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("RPC $name failed with code ${response.code}: ${response.body?.string()}")
            }
            response.body?.string()
        }
    }

    suspend fun familyPush(token: String, deviceId: String, label: String, kind: String, day: Long, payload: JSONObject) {
        val body = JSONObject().apply {
            put("p_token", token)
            put("p_device_id", deviceId)
            put("p_label", label)
            put("p_kind", kind)
            put("p_day", day)
            put("p_payload", payload)
        }
        rpc("family_push", body)
    }

    suspend fun familyPull(token: String, updatedAfter: Long = 0): JSONArray {
        val body = JSONObject().apply {
            put("p_token", token)
            put("p_updated_after", updatedAfter)
        }
        val response = rpc("family_pull", body) ?: "[]"
        return JSONArray(response)
    }

    suspend fun familyForget(token: String) {
        val body = JSONObject().apply {
            put("p_token", token)
        }
        rpc("family_forget", body)
    }

    suspend fun registerPushToken(token: String, deviceId: String, pushToken: String) {
        val body = JSONObject().apply {
            put("p_token", token)
            put("p_device_id", deviceId)
            put("p_push_token", pushToken)
        }
        rpc("family_register_token", body)
    }
}

