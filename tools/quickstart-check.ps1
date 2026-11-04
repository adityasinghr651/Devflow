$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("devflow-quickstart-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$envNames = @('API_PORT', 'API_HOST', 'DATA_DIR', 'ALLOW_LOCAL_TARGETS', 'JWT_SECRET')
$oldEnv = @{}
foreach ($name in $envNames) { $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$api = $null; $target = $null
try {
  Set-Location $root
  $started = Get-Date
  npm ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
  $env:API_PORT = if ($env:QUICKSTART_API_PORT) { $env:QUICKSTART_API_PORT } else { '4173' }
  $env:API_HOST = '127.0.0.1'
  $env:DATA_DIR = Join-Path $tmp 'data'
  $env:ALLOW_LOCAL_TARGETS = 'true'
  $env:JWT_SECRET = 'quickstart-check-secret-that-is-long-enough'
  $target = Start-Process -FilePath 'node' -ArgumentList @('tools/test-target.js', '5050') -WorkingDirectory $root -PassThru -RedirectStandardOutput (Join-Path $tmp 'target.log') -RedirectStandardError (Join-Path $tmp 'target-error.log')
  $api = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $root -PassThru -RedirectStandardOutput (Join-Path $tmp 'api.log') -RedirectStandardError (Join-Path $tmp 'api-error.log')
  $base = "http://127.0.0.1:$($env:API_PORT)/api/v1"
  $deadline = (Get-Date).AddSeconds(20)
  do {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:5050/health' -TimeoutSec 1; break } catch { Start-Sleep -Milliseconds 250 }
  } while ((Get-Date) -lt $deadline)
  if ((Get-Date) -ge $deadline) { throw 'Target did not become healthy.' }
  do {
    try { $null = Invoke-RestMethod "$base/ready" -TimeoutSec 1; break } catch { Start-Sleep -Milliseconds 250 }
  } while ((Get-Date) -lt $deadline)
  if ((Get-Date) -ge $deadline) { throw 'API did not become ready.' }
  $email = "quick-$([guid]::NewGuid().ToString('N'))@example.test"
  $user = Invoke-RestMethod "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ name='Quickstart'; email=$email; password='QuickstartPass123!' } | ConvertTo-Json)
  $headers = @{ Authorization = "Bearer $($user.token)" }
  $savedTarget = Invoke-RestMethod "$base/targets" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ name='Quickstart target'; url='http://127.0.0.1:5050'; environment='local' } | ConvertTo-Json)
  $run = Invoke-RestMethod "$base/runs" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ targetId=$savedTarget.id; path='/health'; method='GET'; concurrency=2; durationSec=2; workerCount=1; authorized=$true } | ConvertTo-Json)
  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 250
    $run = Invoke-RestMethod "$base/runs/$($run.id)" -Headers $headers
  } while ($run.status -notin @('completed','failed','cancelled','timed_out') -and (Get-Date) -lt $deadline)
  if ($run.status -ne 'completed') { throw "Run did not complete: $($run.status)" }
  [pscustomobject]@{ status=$run.status; runId=$run.id; totalRequests=$run.totalRequests; successCount=$run.successCount; failedCount=$run.failedCount } | ConvertTo-Json -Compress
  Write-Output "Quickstart elapsed: $([int]((Get-Date)-$started).TotalSeconds) seconds"
} finally {
  foreach ($proc in @($api, $target)) { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } }
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], 'Process') }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
