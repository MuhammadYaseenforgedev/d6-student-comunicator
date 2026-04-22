param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Step([string]$text) {
  Write-Host ("[demo] {0}" -f $text)
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

function Stop-ProcessById([int]$pid, [string]$label) {
  try {
    $proc = Get-Process -Id $pid -ErrorAction Stop
  } catch {
    Step ("{0} PID {1} already stopped" -f $label, $pid)
    return
  }

  Step ("Stopping {0} PID {1}" -f $label, $pid)
  Stop-Process -Id $pid -ErrorAction SilentlyContinue

  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Get-Process -Id $pid -ErrorAction Stop
      Start-Sleep -Milliseconds 300
    } catch {
      Step ("{0} PID {1} stopped" -f $label, $pid)
      return
    }
  }

  if ($Force) {
    Step ("Force killing {0} PID {1}" -f $label, $pid)
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
}

function Stop-Managed([string]$name, [string]$pattern) {
  $pidPath = Join-Path $LogsDir ("{0}.pid" -f $name)
  $logPathFile = Join-Path $LogsDir ("{0}.logpath" -f $name)
  $pid = Read-Pid $pidPath

  if ($null -ne $pid) {
    Stop-ProcessById $pid $name
  } else {
    Step ("No PID file for {0}; scanning for orphaned process pattern" -f $name)
    $orphans = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -match $pattern }
    foreach ($p in $orphans) {
      Stop-ProcessById ([int]$p.ProcessId) $name
    }
  }

  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $logPathFile -Force -ErrorAction SilentlyContinue
}

Stop-Managed "frontend" "npm --prefix frontend run dev"
Stop-Managed "backend" "npm --prefix backend run dev"

Write-Host ""
Write-Host "Demo processes stopped."

