package com.anonymous.network_tracker.service.push

import android.content.Context
import com.anonymous.network_tracker.data.api.SupabaseRpc
import com.anonymous.network_tracker.data.family.PushProtocol
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

object FamilyPushRegistration {
    private val client = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()

    @Synchronized
    fun configure(context: Context): Boolean {
        if (FirebaseApp.getApps(context).any { it.name == FirebaseApp.DEFAULT_APP_NAME }) return true
        val config = try {
            context.assets.open("google-services.json").bufferedReader().use { JSONObject(it.readText()) }
        } catch (_: java.io.FileNotFoundException) { return false }
        val clients = config.getJSONArray("client")
        val android = (0 until clients.length()).map { clients.getJSONObject(it) }.firstOrNull {
            it.getJSONObject("client_info").getJSONObject("android_client_info").getString("package_name") == context.packageName
        } ?: throw IllegalStateException("Firebase configuration does not match the app package.")
        val project = config.getJSONObject("project_info")
        val options = FirebaseOptions.Builder()
            .setApplicationId(android.getJSONObject("client_info").getString("mobilesdk_app_id"))
            .setApiKey(android.getJSONArray("api_key").getJSONObject(0).getString("current_key"))
            .setGcmSenderId(project.getString("project_number"))
            .setProjectId(project.getString("project_id"))
            .apply { project.optString("storage_bucket").takeIf { it.isNotBlank() }?.let { setStorageBucket(it) } }
            .build()
        FirebaseApp.initializeApp(context, options)
        return true
    }

    fun status(context: Context): String = when {
        !runCatching { configure(context) }.getOrDefault(false) -> "Push setup needed"
        SettingsRepository.getInstance(context).readExtras().optString("pushToken").isBlank() -> "Push registration pending"
        else -> "Push ready"
    }

    // Called under the family's sync lock so an in-flight registration cannot undo unpairing.
    suspend fun register(context: Context) = withContext(Dispatchers.IO) {
        val settings = SettingsRepository.getInstance(context)
        val current = settings.loadSettings()
        val pair = current.pairToken ?: return@withContext
        val device = current.deviceId ?: return@withContext
        if (!configure(context)) return@withContext
        val messaging = FirebaseMessaging.getInstance()
        messaging.isAutoInitEnabled = true
        val nativeToken = withTimeout(20_000L) { messaging.token.await() }
        val extra = settings.readExtras()
        if (nativeToken == extra.optString("nativeFcmToken") && extra.optString("pushToken").isNotBlank()) return@withContext
        val prefs = context.getSharedPreferences("native-push", Context.MODE_PRIVATE)
        val installation = prefs.getString("installation", null) ?: UUID.randomUUID().toString().also {
            check(prefs.edit().putString("installation", it).commit()) { "Could not save push installation ID." }
        }
        val request = Request.Builder().url("https://exp.host/--/api/v2/push/getExpoPushToken")
            .post(PushProtocol.registration(installation, context.packageName, nativeToken)
                .toString().toRequestBody("application/json".toMediaType())).build()
        val expoToken = client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Push registration failed (${response.code}).")
            PushProtocol.token(JSONObject(response.body?.string() ?: throw IOException("Empty push registration response.")))
        }
        SupabaseRpc.registerPushToken(pair, device, expoToken)
        settings.patchExtras(JSONObject().put("nativeFcmToken", nativeToken).put("pushToken", expoToken))
    }

    fun disable(context: Context) {
        if (configure(context)) FirebaseMessaging.getInstance().isAutoInitEnabled = false
    }

    private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
        addOnCompleteListener { task ->
            if (continuation.isActive) {
                if (task.isSuccessful) continuation.resume(task.result)
                else continuation.resumeWithException(task.exception ?: IOException("Push token request failed."))
            }
        }
    }
}
