param(
  [switch]$SkipBuild,
  [switch]$SkipTauri,
  [switch]$SkipBundle
)

Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Root = Resolve-Path (Join-Path $ScriptDir '..')
Set-Location $Root

Write-Host "Starting local test workflow (root: $Root)"

function Ensure-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    return $false
  }
  return $true
}

# Ensure pnpm is available; on Windows try to enable via corepack if possible
if (-not (Ensure-Command pnpm)) {
  Write-Host "pnpm not found. Attempting to enable via corepack..."
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    try {
      & corepack enable
      & corepack prepare pnpm@10.17.1 --activate
    } catch {
      Write-Warning "corepack prepare failed: $_"
    }
  }
  if (-not (Ensure-Command pnpm)) {
    Write-Error "pnpm not found. Install pnpm (corepack enable; corepack prepare pnpm@10.17.1 --activate) or 'npm i -g pnpm@10.17.1' and retry."
    exit 3
  }
}

Write-Host "1) Install JS deps"
pnpm install

Write-Host "2) Verify version consistency"
node scripts/version-check.js

Write-Host "3) Frontend dependency audit (prod)"
pnpm --dir frontend_app audit --prod

if (-not (Get-Command cargo-audit -ErrorAction SilentlyContinue)) {
  Write-Host "Installing cargo-audit (may take a while)"
  cargo install cargo-audit --locked
}

Write-Host "4) Rust dependency audit"
Push-Location desktop/src-tauri
cargo audit
Pop-Location

if (-not $SkipBuild) {
  Write-Host "5) Build frontend assets"
  pnpm --dir frontend_app build
} else {
  Write-Host "Skipping frontend build"
}

if (-not $SkipTauri) {
  Write-Host "6) Build native app (tauri)"
  # Prepare OSS build metadata (if OSS_VERSION exists), run tauri build, then restore originals
  try { node scripts/prepare-oss-build.js } catch { Write-Warning "prepare-oss-build failed: $_" }
  pnpm --dir frontend_app tauri:build
  try { node scripts/restore-oss-build.js } catch { Write-Warning "restore-oss-build failed: $_" }

  Write-Host "7) Verify Windows portable artifact (.exe)"
  $portableExe = Join-Path $Root "desktop/src-tauri/target/release/MindMapVault.exe"
  if (-not (Test-Path $portableExe)) {
    Write-Error "Expected portable exe was not found: $portableExe"
    exit 4
  }
  Write-Host "Portable EXE built: $portableExe"
} else {
  Write-Host "Skipping tauri build"
}

Write-Host "Local test workflow completed. Artifacts (if built):"
Write-Host " - frontend: frontend_app/dist/"
Write-Host " - portable exe: desktop/src-tauri/target/release/MindMapVault.exe"
Write-Host " - bundles (optional on Windows): desktop/src-tauri/target/release/bundle/"

exit 0
