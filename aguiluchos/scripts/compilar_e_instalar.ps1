<#
  Compila la APK de Aguiluchos en Windows, la deja en C:\AGUILUCHO, copia una
  versión a C:\AGUILUCHO\Releases e (opcional) la instala en el móvil por USB.

  Uso (PowerShell, desde la carpeta aguiluchos del repositorio):
    .\scripts\compilar_e_instalar.ps1 -Excel "C:\ruta\DATOS_FINALES_AGUILUCHO_2026_GREFA.xlsx" `
        -SupabaseUrl "https://xxxx.supabase.co" -SupabaseAnonKey "eyJ..."

  Requisitos: Flutter, Android SDK (adb en el PATH) y depuración USB activada.
  El Excel contiene datos personales: se empaqueta en la APK pero NO se sube a git.
#>
param(
  [string]$Excel,
  [string]$SupabaseUrl = '',
  [string]$SupabaseAnonKey = '',
  [string]$Destino = 'C:\AGUILUCHO',
  [switch]$SinInstalar
)
$ErrorActionPreference = 'Stop'
$proyecto = Split-Path -Parent $PSScriptRoot
Set-Location $proyecto

if ($Excel) {
  Copy-Item -LiteralPath $Excel -Destination (Join-Path $proyecto 'assets\seed\datos_campana.xlsx') -Force
}

$defines = @()
if ($SupabaseUrl)     { $defines += "--dart-define=SUPABASE_URL=$SupabaseUrl" }
if ($SupabaseAnonKey) { $defines += "--dart-define=SUPABASE_ANON_KEY=$SupabaseAnonKey" }

flutter pub get
flutter build apk --release @defines
if ($LASTEXITCODE -ne 0) { throw 'La compilación ha fallado.' }

$version = ((Select-String -Path pubspec.yaml -Pattern '^version:\s*(\S+)').Matches[0].Groups[1].Value) -replace '\+', '-'
$releases = Join-Path $Destino 'Releases'
New-Item -ItemType Directory -Force -Path $Destino, $releases | Out-Null

$origen = Join-Path $proyecto 'build\app\outputs\flutter-apk\app-release.apk'
$apk = Join-Path $Destino 'aguiluchos.apk'
Copy-Item -LiteralPath $origen -Destination $apk -Force
Copy-Item -LiteralPath $origen -Destination (Join-Path $releases "aguiluchos-$version.apk") -Force
Write-Host "APK: $apk"
Write-Host "Copia versionada en: $releases"

if (-not $SinInstalar) {
  adb devices
  adb install -r $apk
}
