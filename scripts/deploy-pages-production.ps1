[CmdletBinding()]
param(
  [switch]$ConfirmExistingProduction
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$failureCode = ''
$deployExitCode = 0
$shaVariable = 'RB_PAGES_VERIFIED_ORIGIN_MAIN_SHA'
$timeVariable = 'RB_PAGES_VERIFIED_ORIGIN_MAIN_AT_MS'

Push-Location -LiteralPath $repoRoot
try {
  if (-not $ConfirmExistingProduction) {
    throw 'PRODUCTION_DEPLOY_REQUIRES_EXPLICIT_CONFIRMATION'
  }

  $originRows = @(& git remote get-url origin 2>$null)
  $gitExitCode = $LASTEXITCODE
  if ($gitExitCode -ne 0 -or ($originRows -join '').Trim() -ne 'https://github.com/deboer2026/robobella-analytics.git') {
    throw 'REPOSITORY_IDENTITY_MISMATCH'
  }

  $branchRows = @(& git branch --show-current 2>$null)
  $gitExitCode = $LASTEXITCODE
  if ($gitExitCode -ne 0 -or ($branchRows -join '').Trim() -ne 'main') {
    throw 'RELEASE_BRANCH_REQUIRED'
  }

  $statusRows = @(& git status --porcelain 2>$null)
  $gitExitCode = $LASTEXITCODE
  if ($gitExitCode -ne 0) {
    throw 'GIT_STATUS_READ_FAILED'
  }
  if ($statusRows.Count -gt 0) {
    throw 'CLEAN_WORKTREE_REQUIRED'
  }

  $localHeadRows = @(& git rev-parse HEAD 2>$null)
  $gitExitCode = $LASTEXITCODE
  if ($gitExitCode -ne 0) {
    throw 'GIT_HEAD_READ_FAILED'
  }
  $localHead = ($localHeadRows -join '').Trim()

  $remoteRows = @(& git ls-remote origin refs/heads/main 2>$null)
  $gitExitCode = $LASTEXITCODE
  if ($gitExitCode -ne 0 -or $remoteRows.Count -ne 1) {
    throw 'REMOTE_MAIN_READ_FAILED'
  }
  $remoteParts = ($remoteRows[0] -split '\s+') | Where-Object { $_ }
  if ($remoteParts.Count -ne 2 -or
      $remoteParts[1] -ne 'refs/heads/main' -or
      $remoteParts[0] -notmatch '^[a-f0-9]{40}$') {
    throw 'REMOTE_MAIN_READ_MALFORMED'
  }
  if ($localHead -ne $remoteParts[0]) {
    throw 'LOCAL_MAIN_NOT_CURRENT'
  }

  [Environment]::SetEnvironmentVariable($shaVariable, $remoteParts[0], 'Process')
  [Environment]::SetEnvironmentVariable(
    $timeVariable,
    [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString([Globalization.CultureInfo]::InvariantCulture),
    'Process'
  )

  & node 'scripts/deploy-pages-production.cjs' '--confirm-existing-production'
  $deployExitCode = $LASTEXITCODE
} catch {
  $candidateCode = [string]$_.Exception.Message
  if ($candidateCode -match '^[A-Z0-9_]+$') {
    $failureCode = $candidateCode
  } else {
    $failureCode = 'PAGES_DEPLOY_WRAPPER_FAILED'
  }
} finally {
  [Environment]::SetEnvironmentVariable($shaVariable, $null, 'Process')
  [Environment]::SetEnvironmentVariable($timeVariable, $null, 'Process')
  Pop-Location
}

if ($failureCode) {
  [Console]::Error.WriteLine($failureCode)
  exit 1
}
exit $deployExitCode
