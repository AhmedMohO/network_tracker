# Private release signing and migration

The certificate used through 2.0.1 is compromised: its private key was committed to public Git history. Removing the working-tree key does not revoke it or repair existing installations.

Release builds now require `signing.properties` (ignored) or all four environment inputs: `NETTRACK_KEYSTORE_FILE`, `NETTRACK_KEYSTORE_PASSWORD`, `NETTRACK_KEY_ALIAS`, `NETTRACK_KEY_PASSWORD`. See `signing.properties.example`. The release validation task rejects the compromised certificate. Debug uses Android's debug key and a separate `.debug` application ID; validation tests retain their separate test ID.

A new 4096-bit RSA key has been generated locally in ignored `credentials/private/nettrack-release.p12`, with its random password in ignored `signing.properties`. Back up both securely outside the repository before deleting this checkout. Neither file should ever be committed, uploaded as a release asset, or included in a support bundle.

`signing/release.lineage` contains public certificates and a signed proof of rotation, not private keys. It allows the new signer to inherit existing app data and retains permission compatibility so Android can transfer NetTrack's existing signature permission to the new signer. Rollback to the compromised signer, shared UID, and authenticator trust remain disabled.

Permission compatibility is necessary during this migration: disabling it causes `INSTALL_FAILED_DUPLICATE_PERMISSION` when Android sees the existing `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` declaration. The old signer consequently retains signature-permission trust in this bridge release; do not treat that trust as revoked. Removing that trust requires a subsequent migration after the old permission owner has been replaced, and a bridge path for users still on 2.0.1. Old-key app replacement and access through a shared UID remain blocked.

Build and check:

```powershell
$env:ANDROID_HOME = 'C:/AndroidSDK'
./gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'Build failed; do not sign an older APK.' }
./scripts/sign-rotated-release.ps1
```

On Windows, if R8 reports that `classes.dex` is being used by another process, wait for any active builds to finish, then run `./gradlew.bat --stop` and repeat the sequence above. This releases stale output handles held by idle Gradle daemons. The single-use daemon exits after the build.

The regular `app-release.apk` uses only the new key and supports fresh installs from Android 7 onward. It cannot update an installation signed by the old key by itself.

`dist/NetTrack-rotated-android9.apk` uses the new key and V3 rotation, supporting in-place upgrades on Android 9/API 28 onward. It deliberately contains no signature made using the exposed key. Verify and device-test this artifact before publishing a higher version. Do not replace the existing 2.0.1 release with a same-version APK.

Android 7/8 cannot rotate signing certificates. Existing installations on those versions cannot receive a secure in-place signing-key migration; retaining the old signer would retain the compromise. A distribution/data-migration decision is required before publishing updates for those installations. No existing app has been uninstalled, overwritten, or had its data cleared by this change.

Historical releases and Git history still contain the old key. History rewriting cannot revoke copies already obtained; secure migration is required regardless. No remote history was rewritten and no release was published during this repair.

Register the new certificate with any external services that restrict access by signing certificate before rollout. Its SHA-256 fingerprint is `b4249e84f6603fcf83eb965f1c2ce6ff12139700b0fc3bb059bd51e4a30aed3c`.

Validation on the connected Android 17 device uses a disposable package declaring the same type of signature permission and these exact old/new certificates. `scripts/test-signing-rotation.ps1` checks that the rotated update retains an app-private marker and a higher-version update signed with the old key is rejected with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. The test requires `NETTRACK_LEGACY_TEST_PASSWORD` and removes only its disposable package afterward. The original fixture lacked the signature permission and missed the migration defect. The production app was not replaced. Android 9–16 devices were not available for physical upgrade testing.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing), [apksigner](https://developer.android.com/tools/apksigner), [Android permission ownership checks](https://android.googlesource.com/platform/frameworks/base/+/main/services/core/java/com/android/server/pm/InstallPackageHelper.java).
