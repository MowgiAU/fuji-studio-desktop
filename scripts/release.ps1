# Fuji Studio Desktop — release script
#
# Usage:
#   .\scripts\release.ps1 -Version 0.2.0 [-Notes "What's new"] [-ApiToken "your-admin-session-token"]
#
# Prerequisites:
#   - Rust + cargo in PATH (or in $env:USERPROFILE\.cargo\bin)
#   - TAURI_SIGNING_PRIVATE_KEY set (or the script reads from ~/.tauri/fuji-studio.key)
#   - Admin session cookie OR -ApiToken param for the publish endpoint

param(
    [Parameter(Mandatory=$true)]  [string] $Version,
    [Parameter(Mandatory=$false)] [string] $Notes = "",
    [Parameter(Mandatory=$false)] [string] $ApiUrl = "https://fujistud.io",
    [Parameter(Mandatory=$false)] [string] $ApiToken = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$CargoToml  = "$Root\src-tauri\Cargo.toml"
$TauriConf  = "$Root\src-tauri\tauri.conf.json"
$KeyFile    = "$env:USERPROFILE\.tauri\fuji-studio.key"

Write-Host "`n==> Fuji Studio Desktop release v$Version`n" -ForegroundColor Cyan

# ── 1. Set TAURI_SIGNING_PRIVATE_KEY ──────────────────────────────────────────
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    if (Test-Path $KeyFile) {
        $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KeyFile -Raw
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = " "
        Write-Host "  Loaded signing key from $KeyFile"
    } else {
        Write-Error "TAURI_SIGNING_PRIVATE_KEY is not set and $KeyFile does not exist. Cannot sign."
    }
}

# ── 2. Bump version in Cargo.toml and tauri.conf.json ─────────────────────────
Write-Host "  Bumping version to $Version..."

$cargo = Get-Content $CargoToml -Raw
$cargo = $cargo -replace '(?m)^version = "[\d.]+"', "version = `"$Version`""
Set-Content $CargoToml $cargo -NoNewline

$conf = Get-Content $TauriConf -Raw | ConvertFrom-Json
$conf.version = $Version
$conf | ConvertTo-Json -Depth 10 | Set-Content $TauriConf

# ── 3. Build ──────────────────────────────────────────────────────────────────
Write-Host "  Building (this takes ~3 minutes)..."
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Set-Location $Root
& npm run tauri:build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed." }

# ── 4. Locate installer and .sig ─────────────────────────────────────────────
$BundleDir = "$Root\src-tauri\target\release\bundle\nsis"
$Installer = Get-ChildItem $BundleDir -Filter "*.exe" | Select-Object -First 1
$Sig       = Get-ChildItem $BundleDir -Filter "*.exe.sig" | Select-Object -First 1

if (-not $Installer) { Write-Error "Could not find installer .exe in $BundleDir" }
if (-not $Sig)       { Write-Error "Could not find .sig file in $BundleDir" }

Write-Host "  Installer: $($Installer.FullName)"
Write-Host "  Signature: $($Sig.FullName)"

# ── 5. Upload to server (PowerShell 5.1-compatible multipart) ─────────────────
Write-Host "  Publishing release to $ApiUrl..."

Add-Type -AssemblyName System.Net.Http

$client  = [System.Net.Http.HttpClient]::new()
if ($ApiToken) { $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $ApiToken) }

$content = [System.Net.Http.MultipartFormDataContent]::new()
$content.Add([System.Net.Http.StringContent]::new($Version),          "version")
$content.Add([System.Net.Http.StringContent]::new($Notes),            "notes")

$installerBytes = [System.IO.File]::ReadAllBytes($Installer.FullName)
$installerContent = [System.Net.Http.ByteArrayContent]::new($installerBytes)
$installerContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/octet-stream")
$content.Add($installerContent, "installer", $Installer.Name)

$sigBytes = [System.IO.File]::ReadAllBytes($Sig.FullName)
$sigContent = [System.Net.Http.ByteArrayContent]::new($sigBytes)
$sigContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("text/plain")
$content.Add($sigContent, "signature", $Sig.Name)

$task     = $client.PostAsync("$ApiUrl/api/desktop/publish-release", $content)
$task.Wait()
$respMsg  = $task.Result
$bodyTask = $respMsg.Content.ReadAsStringAsync()
$bodyTask.Wait()
$body = $bodyTask.Result

if (-not $respMsg.IsSuccessStatusCode) {
    Write-Error "Publish failed ($($respMsg.StatusCode)): $body"
}
$response = $body | ConvertFrom-Json
$client.Dispose()

Write-Host "  Published! Manifest:" -ForegroundColor Green
$response.manifest | ConvertTo-Json -Depth 5

# ── 6. Commit version bump ────────────────────────────────────────────────────
Write-Host "  Committing version bump..."
git add "$CargoToml" "$TauriConf"
git commit -m "chore: bump version to $Version"
git tag "v$Version"
git push origin master --tags

Write-Host "`n==> Done. v$Version is live.`n" -ForegroundColor Green
