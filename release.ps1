# Cuts a release: bumps every workspace package.json to the given version,
# commits, tags vX.Y.Z, and (after confirmation) pushes both - which is what
# triggers .github/workflows/docker-publish.yml to build and push the
# tagged image to GHCR.
#
# Usage: .\release.ps1 1.2.3

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "Usage: .\release.ps1 X.Y.Z"
    exit 1
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean - commit or stash first."
    exit 1
}

$branch = git branch --show-current
if ($branch -ne "main") {
    Write-Error "Not on main (currently on '$branch') - switch to main first."
    exit 1
}

git fetch origin main --quiet
$head = git rev-parse HEAD
$originMain = git rev-parse origin/main
if ($head -ne $originMain) {
    Write-Error "main is not up to date with origin/main - pull first."
    exit 1
}

git rev-parse "v$Version" *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Error "Tag v$Version already exists."
    exit 1
}

$files = @(
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "packages/shared/package.json"
)

foreach ($file in $files) {
    $content = Get-Content -Path $file -Raw
    $updated = $content -replace '"version": "[^"]*"', "`"version`": `"$Version`""
    Set-Content -Path $file -Value $updated -NoNewline
}

git add $files
git commit -m "chore: bump version to $Version"
git tag -a "v$Version" -m "v$Version"

Write-Host ""
Write-Host "Committed and tagged v$Version locally. Pushing triggers the Docker publish workflow."
$confirm = Read-Host "Push origin main + v$Version now? [y/N]"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Not pushed. To undo: git reset --hard HEAD~1; git tag -d v$Version"
    exit 0
}

git push origin main
git push origin "v$Version"

Write-Host "Done - https://github.com/PsydoV2/LazySentry/actions"
