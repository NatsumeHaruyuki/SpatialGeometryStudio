param([string]$Task = 'dev:desktop')
. (Join-Path $PSScriptRoot 'environment.ps1')
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
& npm.cmd run $Task
exit $LASTEXITCODE
