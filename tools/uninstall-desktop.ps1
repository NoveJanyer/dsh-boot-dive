#Requires -Version 5.1
<#
  Remove dsh-boot-dive from a DSH profile (default: desktop).

  The plugin folder is left untouched: only the manifest dependency and the
  bundle entry are removed, and the profile is re-linked. Quit DeepSeek Harness
  first while it holds the desktop profile.

  Usage:
    powershell -ExecutionPolicy Bypass -File tools\uninstall-desktop.ps1
    powershell -ExecutionPolicy Bypass -File tools\uninstall-desktop.ps1 -Profile bootlab
#>
param(
	[string]$ProfileName = 'desktop',
	[string]$DshPath = ''
)

$ErrorActionPreference = 'Stop'
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
	throw 'Could not find dsh.cmd. Pass -DshPath explicitly.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $manifest -Destination "$manifest.bak-$stamp"

$json = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($json.dependencies -and $json.dependencies.PSObject.Properties.Name -contains 'dsh-boot-dive') {
	$json.dependencies.PSObject.Properties.Remove('dsh-boot-dive')
}
if ($json.dsh -and $json.dsh.profile -and $json.dsh.profile.bundles) {
	$json.dsh.profile.bundles = @($json.dsh.profile.bundles | Where-Object { $_ -ne 'dsh-boot-dive' })
}

$text = $json | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($manifest, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Manifest updated: $manifest"
Write-Host "Backup:           $manifest.bak-$stamp"

& $dsh plugin --profile $ProfileName install --offline
if ($LASTEXITCODE -ne 0) {
	throw "pnpm install failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host 'Removed. Restart DeepSeek Harness; the plugin folder was not deleted.' -ForegroundColor Green
