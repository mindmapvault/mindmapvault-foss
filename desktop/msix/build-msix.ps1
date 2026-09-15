param([string]$Version = "0.6.2")
# Packs and signs the Microsoft Store MSIX for MindMapVault FOSS from a
# version's portable exe. Usage: .\build-msix.ps1 -Version 0.6.2 - expects
# %USERPROFILE%\Downloads\mindmapvault-foss-<version>-release\MindMapVault-FOSS_<version>_x64-portable.exe
# (target\release\MindMapVault-foss.exe from "tauri build --no-bundle") and
# writes the .msix beside it. Needs the Windows 10 SDK (makeappx, signtool)
# and the store signing certificate in the current user's store. Nothing
# secret lives in this file: the certificate and its private key stay in the
# Windows certificate store and are looked up by subject at run time.
#
# Store product identity (Partner Center -> MindMapVault-FOSS -> Product
# identity). These are public: every published package carries them.
#   Package/Identity/Name                    KornelMarz.MindMapVault-FOSS
#   Package/Identity/Publisher               CN=303071D7-5B25-4A4A-89CE-41735B0B84CD
#   Package/Properties/PublisherDisplayName  Kornel Mar(a-acute)z
#   Package Family Name                      KornelMarz.MindMapVault-FOSS_xktsjggh5zht4
#   Store ID                                 9NMNK1P8D7CZ
#   URL                                      https://apps.microsoft.com/detail/9NMNK1P8D7CZ
# The hosted app is a separate product (KornelMarz.MindMapVault, 9NBPZF75STJG)
# on the same publisher account; a package built with its name is refused here.
$ErrorActionPreference = 'Stop'
$release = Join-Path $env:USERPROFILE "Downloads\mindmapvault-foss-$Version-release"
$stage = Join-Path $env:TEMP "msix-staging-foss"
$exe = Join-Path $release "MindMapVault-FOSS_${Version}_x64-portable.exe"
$icons = Join-Path $PSScriptRoot "..\src-tauri\icons"
$out = Join-Path $release "MindMapVault-FOSS_${Version}_x64.msix"
$sdk = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64"
# Self-signed certificate with the Partner Center publisher CN, shared with the
# hosted app because the publisher is the same; the Store re-signs the package,
# so "terminated in a root" from signtool verify is fine. Found by subject, so
# no thumbprint is kept here; the newest valid one holding a private key wins.
$publisherCn = "CN=303071D7-5B25-4A4A-89CE-41735B0B84CD"
$cert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq $publisherCn -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
  Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) { throw "no valid signing certificate for $publisherCn in Cert:\CurrentUser\My" }
$thumb = $cert.Thumbprint

if (-not (Test-Path $exe)) { throw "portable exe not found: $exe" }
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force "$stage\Assets" | Out-Null
Copy-Item $exe "$stage\MindMapVault-foss.exe"

$needed = @('Square30x30Logo','Square44x44Logo','Square71x71Logo','Square89x89Logo','Square107x107Logo','Square142x142Logo','Square150x150Logo','Square284x284Logo','Square310x310Logo','StoreLogo')
foreach ($n in $needed) {
  $src = Join-Path $icons "$n.png"
  if (-not (Test-Path $src)) { throw "missing icon $src" }
  Copy-Item $src "$stage\Assets\$n.png"
}
# The wide tile is required once Square310x310Logo is referenced. Keep the
# mark square and centred rather than stretching it.
Add-Type -AssemblyName System.Drawing
$srcImg = New-Object System.Drawing.Bitmap("$stage\Assets\Square310x310Logo.png")
$dst = New-Object System.Drawing.Bitmap(310, 150)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($srcImg, 80, 0, 150, 150)
$g.Dispose()
$dst.Save("$stage\Assets\Wide310x150Logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$srcImg.Dispose(); $dst.Dispose()

# PublisherDisplayName must match Partner Center exactly, accent included.
# Spelled with a char code: Windows PowerShell reads a BOM-less script as
# ANSI, and a literal a-acute once reached the Store mangled and was refused.
$publisher = "Kornel Mar" + [char]0x00E1 + "z"
# DisplayName is the name reserved for this product in Partner Center.
# No internetClient capability: this edition never talks to a network, the
# same promise the snap enforces by declaring no network plug.
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">

  <Identity
    Name="KornelMarz.MindMapVault-FOSS"
    Publisher="CN=303071D7-5B25-4A4A-89CE-41735B0B84CD"
    Version="$Version.0"
    ProcessorArchitecture="x64" />

  <Properties>
    <DisplayName>MindMapVault-FOSS</DisplayName>
    <PublisherDisplayName>$publisher</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us" />
  </Resources>

  <Applications>
    <Application Id="App" Executable="MindMapVault-foss.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="MindMapVault-FOSS"
        Description="Offline zero-knowledge encrypted mind maps - no account, no network."
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile
          Wide310x150Logo="Assets\Wide310x150Logo.png"
          Square71x71Logo="Assets\Square71x71Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>

</Package>
"@
[System.IO.File]::WriteAllText("$stage\AppxManifest.xml", $manifest, (New-Object System.Text.UTF8Encoding($false)))

if (Test-Path $out) { Remove-Item $out -Force }
& "$sdk\makeappx.exe" pack /d $stage /p $out /o | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }
& "$sdk\signtool.exe" sign /fd SHA256 /sha1 $thumb /tr http://timestamp.digicert.com /td SHA256 $out | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }
# The Store upload goes by the four-part package version, so hand it a copy
# named that way. The signature covers the contents, not the file name.
$storeOut = Join-Path $release "MindMapVault-FOSS_${Version}.0_x64.msix"
Copy-Item $out $storeOut -Force
Get-Item $out, $storeOut | Select-Object Name,Length | Format-Table -AutoSize
