param([string]$LegacyStore = 'credentials/private/legacy-compromised.keystore')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { throw 'Set ANDROID_HOME.' }
if (-not $env:NETTRACK_LEGACY_TEST_PASSWORD) { throw 'Set NETTRACK_LEGACY_TEST_PASSWORD for the old test signer.' }
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$aapt = Join-Path $sdk 'build-tools/36.0.0/aapt2.exe'
$signer = Join-Path $sdk 'build-tools/36.0.0/apksigner.bat'
$package = 'com.anonymous.network_tracker.signingvalidation20261108'
$folder = Join-Path $root 'build/signing-permission-test'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
function Fixture([int]$version) {
    @"
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$package" android:versionCode="$version" android:versionName="$version">
<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>
<permission android:name="$package.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature"/>
<uses-permission android:name="$package.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"/>
<application android:hasCode="false" android:debuggable="true" android:label="Signing permission test"/>
</manifest>
"@ | Set-Content -LiteralPath (Join-Path $folder 'AndroidManifest.xml') -Encoding utf8
    & $aapt link --manifest (Join-Path $folder 'AndroidManifest.xml') -I (Join-Path $sdk 'platforms/android-36/android.jar') -o (Join-Path $folder 'unsigned.apk')
    if ($LASTEXITCODE -ne 0) { throw 'Fixture build failed.' }
}
function LegacyFixture {
    & $signer sign --ks (Join-Path $root $LegacyStore) --ks-key-alias androiddebugkey --ks-pass env:NETTRACK_LEGACY_TEST_PASSWORD --out (Join-Path $folder 'legacy.apk') (Join-Path $folder 'unsigned.apk')
    if ($LASTEXITCODE -ne 0) { throw 'Legacy fixture signing failed.' }
}
try {
    Fixture 1
    LegacyFixture
    & $adb install -r (Join-Path $folder 'legacy.apk')
    if ($LASTEXITCODE -ne 0) { throw 'Fixture install failed.' }
    & $adb shell run-as $package mkdir -p files
    & $adb shell "run-as $package sh -c 'echo preserved > files/rotation-marker'"
    if ($LASTEXITCODE -ne 0) { throw 'Fixture data setup failed.' }
    Fixture 2
    & (Join-Path $PSScriptRoot 'sign-rotated-release.ps1') -InputApk 'build/signing-permission-test/unsigned.apk' -OutputApk 'build/signing-permission-test/rotated.apk'
    & $adb install -r (Join-Path $folder 'rotated.apk')
    if ($LASTEXITCODE -ne 0) { throw 'Permission-bearing app cannot upgrade with this signing lineage.' }
    $marker = & $adb shell run-as $package cat files/rotation-marker
    if ($LASTEXITCODE -ne 0 -or $marker.Trim() -ne 'preserved') { throw 'Rotation lost fixture data.' }
    Fixture 3
    LegacyFixture
    $rejected = & $adb install -r (Join-Path $folder 'legacy.apk') 2>&1
    if ($LASTEXITCODE -eq 0 -or "$rejected" -notmatch 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
        throw 'Expected higher-version old-key update to be rejected.'
    }
    Write-Output 'PASS: signature permission preserved, app data retained, old-key update rejected.'
} finally {
    & $adb uninstall $package | Out-Null
}
