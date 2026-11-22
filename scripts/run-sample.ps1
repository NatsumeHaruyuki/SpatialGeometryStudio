$ErrorActionPreference = 'Stop'

try {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $projectRoot
    . (Join-Path $PSScriptRoot 'environment.ps1')

    $electronRuntime = Join-Path $env:ELECTRON_OVERRIDE_DIST_PATH 'electron.exe'
    if (-not (Test-Path -LiteralPath $electronRuntime)) {
        throw 'The existing Electron runtime was not found under D:\DevDep\electron\electron45_4_1.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html')) -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist-electron\main.cjs'))) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Sample build failed. Please check the build output.' }
    }

    $sampleRoot = Join-Path $projectRoot 'sample\Windows v0.2'
    New-Item -ItemType Directory -Path $sampleRoot -Force | Out-Null
    $env:SGS_DATA_ROOT = $sampleRoot
    $env:SGS_USER_DATA_ROOT = Join-Path $sampleRoot 'Profile'
    $env:SGS_SAMPLE = '1'
    Remove-Item -LiteralPath Env:SGS_DEV_SERVER -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Start-Process -FilePath $electronRuntime -ArgumentList @("`"$projectRoot`"") -WorkingDirectory $projectRoot -WindowStyle Normal | Out-Null
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Windows v0.2', 'OK', 'Error') | Out-Null
    exit 1
}
