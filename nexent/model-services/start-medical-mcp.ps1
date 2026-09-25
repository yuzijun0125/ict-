$ErrorActionPreference = 'Stop'
$port = 8090
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { exit 0 }
$workDir = 'C:\Users\yuzji\Documents\Codex\2026-09-25\https-github-com-yuzijun0125-ict-git\work\nexent-medical-mcp'
$envFile = Join-Path $workDir '.env'
Get-Content -LiteralPath $envFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
}
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'src/server.js' -WorkingDirectory $workDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workDir 'server.stdout.log') -RedirectStandardError (Join-Path $workDir 'server.stderr.log')