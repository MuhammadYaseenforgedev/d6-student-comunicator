param(
  [string]$BackendUrl = "http://localhost:4000",
  [int]$FrontendPort = 5173,
  [switch]$SkipInstall,
  [switch]$SkipSeed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TranscriptPath = Join-Path $LogsDir ("run-demo-{0}.log" -f $Stamp)
Start-Transcript -Path $TranscriptPath -Append | Out-Null

function Step([string]$text) {
  Write-Host ("[demo] {0}" -f $text)
}

function Ensure-Command([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Required command not found in PATH: $name"
  }
}

function Ensure-EnvFile([string]$targetPath, [string]$examplePath) {
  if (Test-Path -LiteralPath $targetPath) { return }
  if (-not (Test-Path -LiteralPath $examplePath)) {
    throw "Missing env file and example: $targetPath"
  }

  Copy-Item -LiteralPath $examplePath -Destination $targetPath -Force
  Step ("Created {0} from example. Review values before sharing demo externally." -f $targetPath)
}

function Invoke-Checked([string]$exe, [string[]]$args, [string]$workdir) {
  Push-Location $workdir
  try {
    & $exe @args
    if ($LASTEXITCODE -ne 0) {
      throw ("Command failed ({0}): {1} {2}" -f $LASTEXITCODE, $exe, ($args -join " "))
    }
  } finally {
    Pop-Location
  }
}

function Read-Pid([string]$pidPath) {
  if (-not (Test-Path -LiteralPath $pidPath)) { return $null }
  try {
    $raw = Get-Content -LiteralPath $pidPath -Raw
    $pid = [int]($raw.Trim())
    if ($pid -le 0) { return $null }
    return $pid
  } catch {
    return $null
  }
}

function Get-LiveProcessFromPidFile([string]$pidPath) {
  $pid = Read-Pid $pidPath
  if ($null -eq $pid) { return $null }
  try {
    return Get-Process -Id $pid -ErrorAction Stop
  } catch {
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    return $null
  }
}

function Start-ManagedProcess([string]$name, [string]$commandLine) {
  $pidPath = Join-Path $LogsDir ("{0}.pid" -f $name)
  $logPathFile = Join-Path $LogsDir ("{0}.logpath" -f $name)
  $existing = Get-LiveProcessFromPidFile $pidPath
  if ($existing) {
    $logPath = if (Test-Path -LiteralPath $logPathFile) { (Get-Content -LiteralPath $logPathFile -Raw).Trim() } else { "" }
    Step ("{0} already running (PID {1}) {2}" -f $name, $existing.Id, (if ($logPath) { "log: $logPath" } else { "" }))
    return [pscustomobject]@{ pid = $existing.Id; log = $logPath; reused = $true }
  }

  $logPath = Join-Path $LogsDir ("{0}-{1}.log" -f $name, $Stamp)
  $cmd = "$commandLine >> `"$logPath`" 2>&1"
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden

  Set-Content -LiteralPath $pidPath -Value ([string]$proc.Id) -Encoding ascii
  Set-Content -LiteralPath $logPathFile -Value $logPath -Encoding ascii
  Step ("Started {0} (PID {1}) log: {2}" -f $name, $proc.Id, $logPath)

  return [pscustomobject]@{ pid = $proc.Id; log = $logPath; reused = $false }
}

function Wait-ForHttp200([string]$url, [int]$timeoutSeconds, [string]$label) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 5
      if ([int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 300) {
        Step ("{0} is ready at {1}" -f $label, $url)
        return
      }
    } catch {
      Start-Sleep -Milliseconds 800
    }
  }
  throw ("Timed out waiting for {0} at {1}" -f $label, $url)
}

function Print-LastLogLines([string]$path, [int]$lines = 60) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) { return }
  Write-Host ""
  Write-Host ("[demo] tail {0}" -f $path)
  Get-Content -LiteralPath $path -Tail $lines
}

try {
  Ensure-Command "npm"
  Ensure-Command "powershell"

  Step "Preparing env files"
  Ensure-EnvFile (Join-Path $RepoRoot "backend/.env") (Join-Path $RepoRoot "backend/.env.example")
  Ensure-EnvFile (Join-Path $RepoRoot "frontend/.env") (Join-Path $RepoRoot "frontend/.env.example")

  if (-not $SkipInstall) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "backend/node_modules"))) {
      Step "Installing backend dependencies"
      Invoke-Checked "npm" @("--prefix", "backend", "install") $RepoRoot
    } else {
      Step "Backend dependencies already present"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "frontend/node_modules"))) {
      Step "Installing frontend dependencies"
      Invoke-Checked "npm" @("--prefix", "frontend", "install") $RepoRoot
    } else {
      Step "Frontend dependencies already present"
    }
  } else {
    Step "Skipping dependency install"
  }

  Step "Running database migrations (idempotent)"
  Invoke-Checked "npm" @("--prefix", "backend", "run", "migrate") $RepoRoot

  Step "Starting backend"
  $backendProc = Start-ManagedProcess "backend" "set AUTH_REQUIRE_OTP=false && set AUTH_ALLOW_PASSWORD_REGISTER=true && npm --prefix backend run dev"
  try {
    Wait-ForHttp200 "$BackendUrl/api/health" 90 "Backend"
  } catch {
    Print-LastLogLines $backendProc.log
    throw
  }

  if (-not $SkipSeed) {
    Step "Running demo seed/bootstrap (idempotent)"
    Invoke-Checked "powershell" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/demo-bootstrap.ps1", "-BaseUrl", $BackendUrl) $RepoRoot
  } else {
    Step "Skipping demo seed/bootstrap"
  }

  Step "Starting frontend"
  $frontendCmd = "npm --prefix frontend run dev -- --host 0.0.0.0 --port $FrontendPort"
  $frontendProc = Start-ManagedProcess "frontend" $frontendCmd
  try {
    Wait-ForHttp200 "http://localhost:$FrontendPort" 90 "Frontend"
  } catch {
    Print-LastLogLines $frontendProc.log
    throw
  }

  Write-Host ""
  Write-Host "DEMO RUNNING"
  Write-Host ("Backend : {0}" -f $BackendUrl)
  Write-Host ("Frontend: http://localhost:{0}" -f $FrontendPort)
  Write-Host ("Logs    : {0}" -f $LogsDir)
  Write-Host ("Stop    : powershell -ExecutionPolicy Bypass -File scripts/STOP_DEMO_WINDOWS.ps1")
}
finally {
  Stop-Transcript | Out-Null
}
