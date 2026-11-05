package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.family.PushProtocol
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PushProtocolTest {
    @Test fun nativeRegistrationKeepsTheExistingExpoProjectAndWireContract() {
        val body = PushProtocol.registration("installation", "com.anonymous.network_tracker", "native-token")
        assertEquals("fcm", body.getString("type"))
        assertEquals("native-token", body.getString("deviceToken"))
        assertEquals("installation", body.getString("deviceId"))
        assertEquals("dfff9ccc-34af-46da-bf48-88bf34995a5d", body.getString("projectId"))
        assertFalse(body.getBoolean("development"))
        assertEquals("ExpoPushToken[abc_123]", PushProtocol.token(JSONObject("""{"data":{"expoPushToken":"ExpoPushToken[abc_123]"}}""")))
    }
    @Test(expected = IllegalArgumentException::class)
    fun nativeTokenCannotAccidentallyBeSentToTheExpoOnlyBackend() {
        PushProtocol.token(JSONObject("""{"data":{"expoPushToken":"a-raw-fcm-token"}}"""))
    }
}
