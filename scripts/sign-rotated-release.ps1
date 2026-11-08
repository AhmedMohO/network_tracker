param(
    [string]$InputApk = 'app/build/outputs/apk/release/app-release.apk',
    [string]$OutputApk = 'dist/NetTrack-rotated-android9.apk'
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path $PSScriptRoot -Parent
$values = @{}
$propertiesPath = Join-Path $projectPath 'signing.properties'
if (Test-Path -LiteralPath $propertiesPath) {
    foreach ($line in Get-Content -LiteralPath $propertiesPath) {
        if ($line.Trim() -and -not $line.Trim().StartsWith('#')) {
            $parts = $line.Split('=', 2)
            if ($parts.Length -eq 2) { $values[$parts[0].Trim()] = $parts[1].Trim() }
        }
    }
}
function SecretValue([string]$name, [string]$variable) {
    $value = [Environment]::GetEnvironmentVariable($variable)
    if (-not $value) { $value = $values[$name] }
    if (-not $value) { throw "Missing private signing input: $name" }
    return $value
}
$storePath = SecretValue 'storeFile' 'NETTRACK_KEYSTORE_FILE'
if (-not [IO.Path]::IsPathRooted($storePath)) { $storePath = Join-Path $projectPath $storePath }
$sdkPath = $env:ANDROID_HOME
if (-not $sdkPath) { $sdkPath = $env:ANDROID_SDK_ROOT }
if (-not $sdkPath) { throw 'Set ANDROID_HOME to the installed Android SDK.' }
$signer = Join-Path $sdkPath 'build-tools/36.0.0/apksigner.bat'
$inputPath = Join-Path $projectPath $InputApk
$outputPath = Join-Path $projectPath $OutputApk
if ([IO.Path]::GetFullPath($inputPath) -eq [IO.Path]::GetFullPath($outputPath)) { throw 'Input and output must differ.' }
$oldStorePassword = $env:NETTRACK_ROTATION_STORE_PASSWORD
$oldKeyPassword = $env:NETTRACK_ROTATION_KEY_PASSWORD
try {
    $env:NETTRACK_ROTATION_STORE_PASSWORD = SecretValue 'storePassword' 'NETTRACK_KEYSTORE_PASSWORD'
    $env:NETTRACK_ROTATION_KEY_PASSWORD = SecretValue 'keyPassword' 'NETTRACK_KEY_PASSWORD'
    $alias = SecretValue 'keyAlias' 'NETTRACK_KEY_ALIAS'
    New-Item -ItemType Directory -Force -Path (Split-Path $outputPath -Parent) | Out-Null
    # V3-only: Android 9+ can rotate without continuing to sign with the exposed key.
    # Keep lineage permission compatibility so Android can transfer the app's existing signature permission.
    & $signer sign --ks $storePath --ks-key-alias $alias --ks-pass env:NETTRACK_ROTATION_STORE_PASSWORD --key-pass env:NETTRACK_ROTATION_KEY_PASSWORD --lineage (Join-Path $projectPath 'signing/release.lineage') --rotation-min-sdk-version 28 --min-sdk-version 28 --v1-signing-enabled false --v2-signing-enabled false --v3-signing-enabled true --v4-signing-enabled false --out $outputPath $inputPath
    if ($LASTEXITCODE -ne 0) { throw 'Rotated signing failed.' }
    & $signer verify --min-sdk-version 28 --verbose --print-certs $outputPath
    if ($LASTEXITCODE -ne 0) { throw 'Rotated APK verification failed.' }
} finally {
    $env:NETTRACK_ROTATION_STORE_PASSWORD = $oldStorePassword
    $env:NETTRACK_ROTATION_KEY_PASSWORD = $oldKeyPassword
}
