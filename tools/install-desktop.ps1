#Requires -Version 5.1
<#
  Install dsh-boot-dive into a DSH profile (default: desktop).

  It writes the package link and the bundle entry into the profile manifest,
  then lets the DSH CLI create the node_modules link. Quit DeepSeek Harness
  first: the desktop profile manifest is locked while the app runs, and a new
  host bundle only appears after a restart.

  Usage:
    powershell -ExecutionPolicy Bypass -File tools\install-desktop.ps1
    powershell -ExecutionPolicy Bypass -File tools\install-desktop.ps1 -Profile bootlab
#>
param(
	[string]$ProfileName = 'desktop',
	[string]$DshPath = ''
)

$ErrorActionPreference = 'Stop'
$pluginDir = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path (Join-Path $env:USERPROFILE '.dsh\profiles') $ProfileName
$manifest = Join-Path $profileDir 'package.json'

if (-not (Test-Path -LiteralPath $manifest)) {
	throw "Profile manifest not found: $manifest"
}

if ($ProfileName -eq 'desktop') {
	$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
	if ($running) {
		Write-Host ''
		Write-Host 'DeepSeek Harness is still running.' -ForegroundColor Yellow
		Write-Host 'Quit it completely (window + tray), then run this script again.'
		exit 1
	}
}

function Find-Dsh {
	if ($DshPath -ne '' -and (Test-Path -LiteralPath $DshPath)) { return $DshPath }
	$candidates = @()
	$cmd = Get-Command dsh.cmd -ErrorAction SilentlyContinue
	if ($cmd) { $candidates += $cmd.Source }
	$candidates += (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd')
	$roots = @(
		'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
		'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
		'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
	)
	foreach ($root in $roots) {
		Get-ItemProperty $root -ErrorAction SilentlyContinue |
			Where-Object { $_.DisplayName -like '*DeepSeek Harness*' -and $_.InstallLocation } |
			ForEach-Object { $candidates += (Join-Path $_.InstallLocation 'resources\runtime\cli\bin\dsh.cmd') }
	}
	foreach ($candidate in $candidates) {
		if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
	}
	return $null
}

$dsh = Find-Dsh
if (-not $dsh) {
	Write-Host 'Could not find the DSH command line (dsh.cmd).' -ForegroundColor Yellow
	Write-Host 'Pass it explicitly, for example:'
	Write-Host '  -DshPath "C:\path\to\resources\runtime\cli\bin\dsh.cmd"'
	exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $manifest -Destination "$manifest.bak-$stamp"

$json = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $json.dependencies) {
	$json | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
}
$link = 'link:' + ($pluginDir -replace '\\', '/')
$json.dependencies | Add-Member -NotePropertyName 'dsh-boot-dive' -NotePropertyValue $link -Force

if (-not $json.dsh -or -not $json.dsh.profile) {
	throw "Manifest has no dsh.profile block: $manifest"
}
$bundles = @($json.dsh.profile.bundles)
if ($bundles -notcontains 'dsh-boot-dive') { $bundles += 'dsh-boot-dive' }
$json.dsh.profile.bundles = $bundles

$text = $json | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($manifest, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Manifest updated: $manifest"
Write-Host "Backup:           $manifest.bak-$stamp"

& $dsh plugin --profile $ProfileName install --offline
if ($LASTEXITCODE -ne 0) {
	throw "pnpm install failed with exit code $LASTEXITCODE"
}

$linked = Join-Path $profileDir 'node_modules\dsh-boot-dive'
if (Test-Path -LiteralPath $linked) {
	Write-Host ''
	Write-Host 'Installed.' -ForegroundColor Green
	Write-Host 'Restart DeepSeek Harness to see the opening sequence.'
	Write-Host 'Skip it with a click or Esc. Silence it later with tools\uninstall-desktop.ps1.'
} else {
	throw "Install finished but $linked is missing."
}
