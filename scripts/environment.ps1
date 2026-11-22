$ErrorActionPreference = 'Stop'
$nodeBin = 'D:\DevDep\nodeJs\node-v24.22.3-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $nodeBin 'node.exe'))) { throw 'Node.js is expected under D:\DevDep\nodeJs. See README.md.' }
$env:PATH = $nodeBin + ';' + $env:PATH
$env:npm_config_cache = 'D:\DevDep\npmCache'
$env:ELECTRON_CACHE = 'D:\DevDep\electron\cache'
$env:ELECTRON_BUILDER_CACHE = 'D:\DevDep\electronBuilder'
$env:ELECTRON_OVERRIDE_DIST_PATH = 'D:\DevDep\electron\electron45_4_1'
