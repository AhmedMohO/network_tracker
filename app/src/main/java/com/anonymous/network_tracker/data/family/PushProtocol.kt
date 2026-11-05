package com.anonymous.network_tracker.data.family

import org.json.JSONObject

object PushProtocol {
    fun registration(installation: String, appId: String, nativeToken: String): JSONObject = JSONObject()
        .put("type", "fcm").put("deviceId", installation).put("development", false)
        .put("appId", appId).put("deviceToken", nativeToken)
        .put("projectId", "dfff9ccc-34af-46da-bf48-88bf34995a5d")

    fun token(response: JSONObject): String = response.getJSONObject("data").getString("expoPushToken").also {
        require(Regex("Expo(nent)?PushToken\\[[A-Za-z0-9_-]+]").matches(it)) { "Invalid push token response." }
    }
}
