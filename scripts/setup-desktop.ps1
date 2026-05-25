param(
    [ValidateSet("validate", "dev", "build")]
    [string]$Mode = "validate"
)

$ErrorActionPreference = "Stop"

function Invoke-StepCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$File,
        [Parameter(Mandatory = $false)]
        [string[]]$Args = @(),
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    Write-Host ""
    Write-Host "==> $Label" -ForegroundColor Cyan
    & $File @Args
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Test-RequiredCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not available in PATH."
    }
}

function Get-MajorVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VersionText
    )

    $match = [regex]::Match($VersionText, "(\d+)")
    if (-not $match.Success) {
        throw "Could not parse version from '$VersionText'."
    }

    return [int]$match.Groups[1].Value
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "MindMapVault FOSS desktop setup" -ForegroundColor Green
Write-Host "Repository root: $repoRoot"
Write-Host "Mode: $Mode"

Test-RequiredCommand -Name "node"
Test-RequiredCommand -Name "pnpm"
Test-RequiredCommand -Name "rustc"
Test-RequiredCommand -Name "cargo"

Write-Host ""
Write-Host "==> Checking tool versions" -ForegroundColor Cyan
$nodeVersion = (& node -v).Trim()
if ($LASTEXITCODE -ne 0) { throw "node -v failed." }
$pnpmVersion = (& pnpm -v).Trim()
if ($LASTEXITCODE -ne 0) { throw "pnpm -v failed." }
$rustcVersion = (& rustc -V).Trim()
if ($LASTEXITCODE -ne 0) { throw "rustc -V failed." }
$cargoVersion = (& cargo -V).Trim()
if ($LASTEXITCODE -ne 0) { throw "cargo -V failed." }

$nodeMajor = Get-MajorVersion -VersionText $nodeVersion
$pnpmMajor = Get-MajorVersion -VersionText $pnpmVersion

if ($nodeMajor -lt 20) {
    throw "Node.js 20+ is required. Found: $nodeVersion"
}

if ($pnpmMajor -lt 10) {
    throw "pnpm 10+ is required. Found: $pnpmVersion"
}

Write-Host "Node:  $nodeVersion"
Write-Host "pnpm:  $pnpmVersion"
Write-Host "rustc: $rustcVersion"
Write-Host "cargo: $cargoVersion"

$installSucceeded = $false
$previousCi = $env:CI
$env:CI = "true"
try {
    Invoke-StepCommand -File "pnpm" -Args @("--dir", "frontend_app", "install") -Label "Install frontend dependencies"
    $installSucceeded = $true
}
catch {
    Write-Warning "Initial dependency install failed. Trying a one-time clean reinstall of node_modules."

    if (Test-Path "node_modules") {
        Remove-Item -Recurse -Force "node_modules"
        Write-Host "Removed root node_modules folder."
    }

    Invoke-StepCommand -File "pnpm" -Args @("--dir", "frontend_app", "install") -Label "Reinstall frontend dependencies"
    $installSucceeded = $true
}
finally {
    if ($null -ne $previousCi) {
        $env:CI = $previousCi
    }
    else {
        Remove-Item Env:CI -ErrorAction SilentlyContinue
    }
}

if (-not $installSucceeded) {
    throw "Dependency installation did not complete."
}

Invoke-StepCommand -File "pnpm" -Args @("--dir", "frontend_app", "build") -Label "Build frontend"
Invoke-StepCommand -File "pnpm" -Args @("--dir", "frontend_app", "tauri", "info") -Label "Validate Tauri toolchain"

switch ($Mode) {
    "dev" {
        Write-Host ""
        Write-Host "Setup complete. Starting desktop app in development mode..." -ForegroundColor Yellow
        Invoke-StepCommand -File "pnpm" -Args @("--dir", "frontend_app", "tauri:dev") -Label "Run desktop app (dev)"
    }
    "build" {
        Invoke-StepCommand -File "pnpm" -Args @("--dir", "frontend_app", "tauri:build") -Label "Build desktop artifacts"
        Write-Host ""
        Write-Host "Build complete. Installer output is usually under:" -ForegroundColor Green
        Write-Host "desktop/src-tauri/target/release/bundle/"
    }
    default {
        Write-Host ""
        Write-Host "Setup validation complete." -ForegroundColor Green
        Write-Host "Next steps:"
        Write-Host "  1) Run dev app:   .\\scripts\\setup-desktop.ps1 -Mode dev"
        Write-Host "  2) Build bundle:  .\\scripts\\setup-desktop.ps1 -Mode build"
    }
}
