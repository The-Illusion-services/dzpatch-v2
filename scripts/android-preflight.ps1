param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("dzpatch", "foodhunt-customer", "foodhunt-store")]
  [string]$App,

  [string]$Serial,
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sdkDir = $env:ANDROID_HOME
if (-not $sdkDir) { $sdkDir = $env:ANDROID_SDK_ROOT }
if (-not $sdkDir) { $sdkDir = Join-Path $env:LOCALAPPDATA "Android\Sdk" }

$apps = @{
  "dzpatch" = @{
    Path = $repoRoot
    Apk = "android\app\build\outputs\apk\debug\app-debug.apk"
    LocalProperties = "android\local.properties"
  }
  "foodhunt-customer" = @{
    Path = Join-Path $repoRoot "_external_\foodhunt-mobile"
    Apk = "android\app\build\outputs\apk\debug\app-debug.apk"
    LocalProperties = "android\local.properties"
    RequiredAssets = @(
      "assets\images\icon.png",
      "assets\images\splash-icon.png",
      "assets\images\icon-rounded-2.png"
    )
  }
  "foodhunt-store" = @{
    Path = Join-Path $repoRoot "_external_\foodhunt-store-mobile-main\foodhunt-store-mobile-main"
    Apk = "android\app\build\outputs\apk\debug\app-debug.apk"
    LocalProperties = "android\local.properties"
  }
}

$config = $apps[$App]
$appPath = $config.Path

function Write-Check($ok, $message) {
  if ($ok) {
    Write-Host "[OK]   $message" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $message" -ForegroundColor Red
    $script:failed = $true
  }
}

$failed = $false

Write-Host "Android preflight: $App" -ForegroundColor Cyan
Write-Check (Test-Path -LiteralPath $appPath) "Project path exists: $appPath"

Write-Check (Test-Path -LiteralPath $sdkDir) "Android SDK exists: $sdkDir"
Write-Check (Test-Path -LiteralPath (Join-Path $sdkDir "platform-tools\adb.exe")) "adb exists under SDK"
Write-Check (Test-Path -LiteralPath (Join-Path $sdkDir "platforms")) "SDK platforms folder exists"
Write-Check (Test-Path -LiteralPath (Join-Path $sdkDir "cmake")) "SDK CMake folder exists"

$localProperties = Join-Path $appPath $config.LocalProperties
if (Test-Path -LiteralPath (Split-Path -Parent $localProperties)) {
  $escapedSdk = $sdkDir -replace "\\", "\\"
  Set-Content -Path $localProperties -Value "sdk.dir=$escapedSdk"
  Write-Check $true "Wrote local.properties SDK path"
}

if ($config.RequiredAssets) {
  foreach ($asset in $config.RequiredAssets) {
    Write-Check (Test-Path -LiteralPath (Join-Path $appPath $asset)) "Required asset exists: $asset"
  }
}

if ($Serial) {
  $devices = & adb devices
  Write-Check (($devices -join "`n") -match [regex]::Escape($Serial)) "ADB sees device: $Serial"
}

if ($Port -gt 0) {
  $portBusy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($portBusy) {
    Write-Host "[WARN] Port $Port is already in use. Stop that Expo server or use the matching port in adb reverse." -ForegroundColor Yellow
  } else {
    Write-Host "[OK]   Port $Port is free" -ForegroundColor Green
  }
}

$cxxPath = Join-Path $appPath "android\app\.cxx"
if (Test-Path -LiteralPath $cxxPath) {
  Write-Host "[WARN] Stale CMake cache exists: $cxxPath" -ForegroundColor Yellow
  Write-Host "       If native build fails, remove it with:" -ForegroundColor Yellow
  Write-Host "       Remove-Item -Recurse -Force `"$cxxPath`"" -ForegroundColor Yellow
}

$apkPath = Join-Path $appPath $config.Apk
if (Test-Path -LiteralPath $apkPath) {
  Write-Host "[OK]   Debug APK already exists: $apkPath" -ForegroundColor Green
} else {
  Write-Host "[INFO] Debug APK does not exist yet: $apkPath" -ForegroundColor DarkCyan
}

if ($failed) {
  Write-Host "Preflight failed. Fix the [FAIL] items before building." -ForegroundColor Red
  exit 1
}

Write-Host "Preflight passed." -ForegroundColor Green
