# Family push setup for the native Kotlin app

The native app has three independent triggers for the same serialized usage/family check:

1. Unique periodic WorkManager work, registered at application startup.
2. The optional keep-alive foreground service and idle-capable alarm. Wi-Fi attribution shares this service/alarm; either enabled switch keeps it active.
3. FCM data-only wake-ups from the existing Supabase → Expo delivery path.

Foreground app use also requests a check every five minutes. Android can defer background work; physical-device idle/Doze tests are still necessary.

## Required external configuration

Neither project currently contains google-services.json. Push delivery cannot be tested or enabled without the app owner's configuration.

- Register Firebase Android package com.anonymous.network_tracker and put its google-services.json in this native project root. The file is ignored by Git. The build copies it into generated APK assets; a later build without the file removes the generated copy.
- Configure the Firebase project's FCM v1 service account in the existing EAS project dfff9ccc-34af-46da-bf48-88bf34995a5d. The private service account belongs in EAS, never in the APK or repository.
- Keep the existing family_register_token function and family_ping_stale cron job from docs/family-schema.sql. Existing Expo devices remain compatible; no backend protocol change is required.

At startup, the app reads the public Firebase Android configuration and initializes FirebaseOptions directly, without a React Native runtime or google-services Gradle plugin. Automatic token registration is disabled while unpaired. A paired sync obtains an FCM token, exchanges it for an Expo token using the same endpoint/payload as the original Expo client, then registers that Expo token with the existing family RPC. Registration failures do not prevent ordinary family synchronization. Token changes enqueue another check.

Family shows “Push setup needed”, “Push registration pending”, or “Push ready”. Ready means a token was registered; it does not prove successful server delivery. Confirm the EAS credential and cron configuration separately.

## Receiver behavior and privacy

FamilyMessagingService treats every received data message as a wake-up signal and ignores its payload. It enqueues durable WorkManager work; a remote message cannot set limits, pairing, or arbitrary device behavior. Family operations and token registration share the same lock, so registration cannot recreate a pairing after unpairing. Unpair deletes the remote family first, clears the local family cache and pairing fields, and disables automatic FCM initialization. Local usage history is retained.

## Verification

Build and install an update in place, grant notification permission on Android 13+, pair old/new device combinations, and confirm an Expo-formatted row in family_push_tokens. Use the existing family_ping_stale function/cron to verify a sleeping paired child wakes, updates its recent snapshot, and does not produce a visible notification for the data-only message. Also test network loss, token rotation, unpairing, battery restrictions, reboot, and package replacement.

Without Firebase/EAS credentials the WorkManager and alarm paths still operate; live FCM delivery remains unverified.
