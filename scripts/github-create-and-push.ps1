#Requires -Version 5.1
<#
  One-time: authenticate GitHub CLI (opens browser or device flow):
    & "$env:ProgramFiles\GitHub CLI\gh.exe" auth login

  Then run this script from the repo root to create the remote repo and push main:
    .\scripts\github-create-and-push.ps1
    .\scripts\github-create-and-push.ps1 -RepoName "my-northstar-fork" -Private
#>
param(
  [string]$RepoName = "northstar-reader",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
$gh = Join-Path ${env:ProgramFiles} "GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) {
  throw "GitHub CLI not found at $gh. Install with: winget install GitHub.cli"
}

$auth = & $gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Run this first, then re-run this script:" -ForegroundColor Yellow
  Write-Host "  & `"$gh`" auth login" -ForegroundColor Cyan
  exit 1
}

$visibility = if ($Private) { "--private" } else { "--public" }
Set-Location (Join-Path $PSScriptRoot "..")
Write-Host "Creating GitHub repo '$RepoName' and pushing branch main..." -ForegroundColor Green
& $gh repo create $RepoName $visibility --source=. --remote=origin --push
Write-Host "Done. Remote:" -ForegroundColor Green
& $gh repo view --web
