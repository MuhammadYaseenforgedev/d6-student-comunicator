param(
  [string]$BaseUrl = "http://localhost:4000",
  [string]$BootstrapAdminEmail = "",
  [string]$BootstrapAdminPassword = "",
  [string]$PromoteEmailToAdmin = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Net.Http

$demoPass = "D6Demo!2026"
$demo = [ordered]@{
  ADMIN = "admin_demo@local.test"
  LECTURER = "lecturer_demo@local.test"
  STUDENT = "student_demo@local.test"
  STUDENT2 = "student_demo2@local.test"
  PARENT = "parent_demo@local.test"
}

$missing = @{}
$warn = @{}
$res = [ordered]@{
  users = [ordered]@{}
  linkedChildren = @()
  channelId = ""
  uploadId = ""
  uploadDownloadBytes = 0
  uploadVerifiedVia = ""
  threadId = ""
  calendarCount = 0
  resultCount = 0
  financeDocCount = 0
  announcementCount = 0
  announcementsVerifiedToParent = $false
  uploadsVerifiedDownload = $false
}

$script:http = [System.Net.Http.HttpClient]::new()
$script:http.Timeout = [TimeSpan]::FromSeconds(45)
$script:http.DefaultRequestHeaders.Accept.Clear()
$script:http.DefaultRequestHeaders.Accept.Add([System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new("application/json"))

function Add-Missing([string]$m) { if ($m) { $missing[$m] = $true } }
function Add-Warn([string]$m) { if ($m) { $warn[$m] = $true } }
function U([string]$p) {
  $b = $BaseUrl.TrimEnd("/")
  if ($p -match "^https?://") { return $p }
  if ($p.StartsWith("/")) { return "$b$p" }
  return "$b/$p"
}
function Redact([string]$t) {
  if ([string]::IsNullOrWhiteSpace($t)) { return "(none)" }
  if ($t.Length -le 12) { return "$t..." }
  return "$($t.Substring(0, 12))..."
}
function Raw([object]$r) {
  if ($null -eq $r) { return "(null)" }
  if ($r.raw) { return [string]$r.raw }
  if ($r.body) {
    try { return ($r.body | ConvertTo-Json -Depth 30 -Compress) } catch {}
  }
  return "(empty)"
}
function Fail([string]$msg, [object]$resp, [object]$extra) {
  Write-Host ""
  Write-Host ("FAIL: {0}" -f $msg)
  if ($resp) {
    Write-Host ("- HTTP status: {0}" -f [int]$resp.status)
    Write-Host ("- Response body: {0}" -f (Raw $resp))
  }
  if ($extra) {
    if ($extra -is [string]) {
      Write-Host ("- Context: {0}" -f $extra)
    } else {
      try { Write-Host ("- Context: {0}" -f ($extra | ConvertTo-Json -Depth 30 -Compress)) } catch {}
    }
  }
  throw $msg
}
function Parse-Json([string]$raw) {
  if (-not $raw) { return $null }
  try {
    return $raw | ConvertFrom-Json -Depth 50
  } catch {
    try {
      return $raw | ConvertFrom-Json
    } catch {
      return $null
    }
  }
}
function Arr([object]$b) {
  if ($null -eq $b) { return @() }
  if ($b -is [System.Array]) { return @($b) }
  $pn = @($b.PSObject.Properties.Name)
  if ($pn -contains "value") {
    $v = $b.value
    if ($v -is [System.Array]) { return @($v) }
    if (($v -is [System.Collections.IEnumerable]) -and -not ($v -is [string])) { return @($v) }
  }
  return @()
}
function Err([object]$r) {
  if ($null -eq $r) { return "Unknown" }
  $b = $r.body
  if ($b) {
    $pn = @($b.PSObject.Properties.Name)
    if ($pn -contains "error") {
      $e = $b.error
      if ($e -is [string]) { return $e }
      if ($e) {
        $ep = @($e.PSObject.Properties.Name)
        if ($ep -contains "message") {
          $c = if ($ep -contains "code") { [string]$e.code } else { "ERROR" }
          return "${c}: $($e.message)"
        }
      }
    }
    if ($pn -contains "message") { return [string]$b.message }
  }
  if ($r.raw) { return [string]$r.raw }
  return "HTTP $($r.status)"
}
function Api {
  param([ValidateSet("GET", "POST", "PATCH", "PUT", "DELETE")][string]$Method, [string]$Path, [string]$Token, [object]$Body)
  $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), (U $Path))
  if ($Token) { $req.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Token) }
  if ($PSBoundParameters.ContainsKey("Body")) {
    $json = $Body | ConvertTo-Json -Depth 20 -Compress
    $req.Content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, "application/json")
  }
  try {
    $resp = $script:http.SendAsync($req).GetAwaiter().GetResult()
  } catch {
    $req.Dispose()
    return [pscustomobject]@{ ok = $false; status = 0; body = $null; raw = $_.Exception.Message }
  }
  $req.Dispose()
  try {
    $raw = ""
    if ($resp.Content) { $raw = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult() }
    $obj = $null
    if ($raw) { $obj = Parse-Json $raw }
    $s = [int]$resp.StatusCode
    return [pscustomobject]@{ ok = ($s -ge 200 -and $s -lt 300); status = $s; body = $obj; raw = $raw }
  } finally {
    $resp.Dispose()
  }
}
function RepoRoot() {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
function Read-DotEnv([string]$path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $path) {
    $t = [string]$line
    if ([string]::IsNullOrWhiteSpace($t)) { continue }
    if ($t.TrimStart().StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }
    $k = $t.Substring(0, $idx).Trim()
    $v = $t.Substring($idx + 1).Trim()
    if ($v.Length -ge 2) {
      if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
        $v = $v.Substring(1, $v.Length - 2)
      }
    }
    $map[$k] = $v
  }
  return $map
}
function With-PgEnv([hashtable]$cfg, [scriptblock]$Action) {
  $keys = @("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE")
  $old = @{}
  foreach ($k in $keys) {
    $old[$k] = [System.Environment]::GetEnvironmentVariable($k, "Process")
  }
  try {
    $env:PGHOST = [string]$cfg.DB_HOST
    $env:PGPORT = [string]$cfg.DB_PORT
    $env:PGUSER = [string]$cfg.DB_USER
    $env:PGPASSWORD = [string]$cfg.DB_PASSWORD
    $env:PGDATABASE = [string]$cfg.DB_NAME
    return & $Action
  } finally {
    foreach ($k in $keys) {
      [System.Environment]::SetEnvironmentVariable($k, $old[$k], "Process")
    }
  }
}
function Try-DbUserSummary() {
  $out = [ordered]@{
    ok = $false
    userCount = -1
    adminCount = -1
    emails = @()
    reason = ""
  }
  $psql = Get-Command "psql" -ErrorAction SilentlyContinue
  if (-not $psql) {
    $out.reason = "psql not found in PATH."
    return [pscustomobject]$out
  }

  $envPath = Join-Path (Join-Path (RepoRoot) "backend") ".env"
  $cfg = Read-DotEnv $envPath
  if (-not $cfg.ContainsKey("DB_HOST") -or -not $cfg.ContainsKey("DB_PORT") -or -not $cfg.ContainsKey("DB_USER") -or -not $cfg.ContainsKey("DB_PASSWORD") -or -not $cfg.ContainsKey("DB_NAME")) {
    $out.reason = "DB settings missing in backend/.env."
    return [pscustomobject]$out
  }

  try {
    $summary = With-PgEnv $cfg { psql -t -A -c "SELECT COUNT(*)::int || '|' || COUNT(*) FILTER (WHERE role='ADMIN')::int FROM users;" 2>&1 }
    if ($LASTEXITCODE -ne 0) {
      $out.reason = [string]($summary -join [Environment]::NewLine)
      return [pscustomobject]$out
    }
    $line = [string](($summary | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1))
    if (-not $line) {
      $out.reason = "No rows returned while checking users table."
      return [pscustomobject]$out
    }

    $parts = $line.Split("|")
    if ($parts.Count -lt 2) {
      $out.reason = "Unexpected output while checking users table: $line"
      return [pscustomobject]$out
    }

    $out.userCount = [int]$parts[0]
    $out.adminCount = [int]$parts[1]

    $emails = With-PgEnv $cfg { psql -t -A -c "SELECT email FROM users ORDER BY lower(email) LIMIT 10;" 2>&1 }
    if ($LASTEXITCODE -eq 0) {
      $list = @($emails | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
      $out.emails = $list
    }

    $out.ok = $true
    return [pscustomobject]$out
  } catch {
    $out.reason = $_.Exception.Message
    return [pscustomobject]$out
  }
}
function SqlLiteral([string]$v) {
  $sv = if ($null -eq $v) { "" } else { [string]$v }
  return "'" + ($sv -replace "'", "''") + "'"
}
function Print-AdminPromotionHelp([string]$targetEmail, [object]$dbInfo) {
  $target = if ($targetEmail) { $targetEmail.Trim().ToLowerInvariant() } else { "" }
  if (-not $target) { $target = $demo.PARENT }
  $sqlEmail = SqlLiteral $target

  Write-Host ""
  Write-Host "LOCAL DEMO ACTION REQUIRED"
  if ($dbInfo -and $dbInfo.ok) {
    Write-Host ("- DB users detected: {0} | admins detected: {1}" -f [int]$dbInfo.userCount, [int]$dbInfo.adminCount)
    if (@($dbInfo.emails).Count -gt 0) {
      Write-Host ("- Sample users: {0}" -f (@($dbInfo.emails) -join ", "))
    }
  } elseif ($dbInfo -and $dbInfo.reason) {
    Write-Host ("- DB auto-detect unavailable: {0}" -f [string]$dbInfo.reason)
  }

  Write-Host "- Promote a known local user to ADMIN using Postgres:"
  Write-Host "  BEGIN;"
  Write-Host ("  SELECT id, email, role FROM users WHERE lower(email) = lower({0});" -f $sqlEmail)
  Write-Host ("  UPDATE users SET role = 'ADMIN' WHERE lower(email) = lower({0});" -f $sqlEmail)
  Write-Host ("  SELECT id, email, role FROM users WHERE lower(email) = lower({0});" -f $sqlEmail)
  Write-Host "  COMMIT;"
  Write-Host ("- Re-run with: .\scripts\demo-bootstrap.ps1 -BootstrapAdminEmail '{0}' -BootstrapAdminPassword '<known password>'" -f $target)
}
function Try-AdminCredsFromEnv() {
  $envPath = Join-Path (Join-Path (RepoRoot) "backend") ".env"
  $cfg = Read-DotEnv $envPath
  $pairs = @(
    @{ email = "BOOTSTRAP_ADMIN_EMAIL"; pass = "BOOTSTRAP_ADMIN_PASSWORD" },
    @{ email = "ADMIN_EMAIL"; pass = "ADMIN_PASSWORD" },
    @{ email = "SEED_ADMIN_EMAIL"; pass = "SEED_ADMIN_PASSWORD" }
  )
  foreach ($p in $pairs) {
    $ek = [string]$p.email
    $pk = [string]$p.pass
    if (-not $cfg.ContainsKey($ek) -or -not $cfg.ContainsKey($pk)) { continue }
    $e = [string]$cfg[$ek]
    $pw = [string]$cfg[$pk]
    if ([string]::IsNullOrWhiteSpace($e) -or [string]::IsNullOrWhiteSpace($pw)) { continue }
    return [pscustomobject]@{
      ok = $true
      email = $e.Trim().ToLowerInvariant()
      password = $pw
      source = "backend/.env ($ek/$pk)"
    }
  }
  return [pscustomobject]@{
    ok = $false
    email = ""
    password = ""
    source = ""
  }
}

function Otp([string]$email, [string]$purpose) {
  $r = Api POST "/api/auth/request-otp" "" @{ email = $email; purpose = $purpose }
  if (-not $r.ok) {
    Add-Warn "OTP request failed for ${email}/${purpose}: $(Err $r)"
    return ""
  }
  if ($r.body -and (@($r.body.PSObject.Properties.Name) -contains "devCode")) {
    return [string]$r.body.devCode
  }
  Add-Missing "OTP required for $purpose but devCode not returned for $email. Set OTP_RETURN_DEV_CODE=true."
  return ""
}
function AuthFromResponse([object]$r, [string]$ctx) {
  if (-not $r.ok) {
    return [pscustomobject]@{ ok = $false; token = ""; user = $null; reason = (Err $r) }
  }

  $token = ""
  $user = $null
  if ($r.body) {
    $pn = @($r.body.PSObject.Properties.Name)
    if ($pn -contains "token") { $token = [string]$r.body.token }
    if ($pn -contains "user") { $user = $r.body.user }
  }

  if (-not $token) {
    return [pscustomobject]@{
      ok = $false
      token = ""
      user = $user
      reason = "$ctx response missing token."
    }
  }

  return [pscustomobject]@{ ok = $true; token = $token; user = $user; reason = "" }
}

function Login([string]$email, [string]$pass) {
  $r = Api POST "/api/auth/login" "" @{ email = $email; password = $pass }
  if ($r.ok) {
    $parsed = AuthFromResponse $r "Login"
    if ($parsed.ok) { return $parsed }
    return [pscustomobject]@{ ok = $false; reason = $parsed.reason }
  }
  if ($r.status -eq 400) {
    $otp = Otp $email "LOGIN"
    if ($otp) {
      $r2 = Api POST "/api/auth/login" "" @{ email = $email; password = $pass; otp = $otp }
      if ($r2.ok) {
        $parsed2 = AuthFromResponse $r2 "Login"
        if ($parsed2.ok) { return $parsed2 }
        return [pscustomobject]@{ ok = $false; reason = $parsed2.reason }
      }
      return [pscustomobject]@{ ok = $false; reason = (Err $r2) }
    }
  }
  return [pscustomobject]@{ ok = $false; reason = (Err $r) }
}

function RegisterParent([string]$email, [string]$pass) {
  $r = Api POST "/api/auth/register" "" @{ email = $email; password = $pass }
  if ($r.ok) {
    $parsed = AuthFromResponse $r "Register"
    if ($parsed.ok) {
      return [pscustomobject]@{ ok = $true; token = [string]$parsed.token; user = $parsed.user; exists = $false; reason = "" }
    }
    return [pscustomobject]@{ ok = $false; exists = $false; reason = $parsed.reason }
  }
  $er = Err $r
  if ($r.status -eq 400 -and $er -match "Email already exists") {
    return [pscustomobject]@{ ok = $false; exists = $true; reason = $er }
  }
  if ($r.status -eq 400) {
    $otp = Otp $email "REGISTER"
    if ($otp) {
      $r2 = Api POST "/api/auth/register" "" @{ email = $email; password = $pass; otp = $otp }
      if ($r2.ok) {
        $parsed2 = AuthFromResponse $r2 "Register"
        if ($parsed2.ok) {
          return [pscustomobject]@{ ok = $true; token = [string]$parsed2.token; user = $parsed2.user; exists = $false; reason = "" }
        }
        return [pscustomobject]@{ ok = $false; exists = $false; reason = $parsed2.reason }
      }
      $er2 = Err $r2
      return [pscustomobject]@{ ok = $false; exists = ($r2.status -eq 400 -and $er2 -match "Email already exists"); reason = $er2 }
    }
  }
  return [pscustomobject]@{ ok = $false; exists = $false; reason = $er }
}

function EnsureParent([string]$email, [string]$pass) {
  $l = Login $email $pass
  if ($l.ok) { return $l }
  $reg = RegisterParent $email $pass
  if ($reg.ok) { return $reg }
  if ($reg.exists) {
    $l2 = Login $email $pass
    if ($l2.ok) { return $l2 }
  }
  return [pscustomobject]@{ ok = $false; reason = "Parent setup failed. Login=$($l.reason); Register=$($reg.reason)" }
}

function EnsureRole([string]$role, [string]$email, [string]$pass, [string]$adminToken) {
  $l = Login $email $pass
  if ($l.ok) {
    if (([string]$l.user.role).ToUpperInvariant() -ne $role) {
      Add-Warn "$email logged in as $($l.user.role), expected $role."
    }
    return $l
  }
  if (-not $adminToken) {
    Add-Missing "Cannot create $role user $email without ADMIN token."
    return [pscustomobject]@{ ok = $false; reason = "No admin token" }
  }
  $c = Api POST "/api/auth/admin-create" $adminToken @{ email = $email; password = $pass; role = $role }
  if ($c.status -eq 404) {
    Add-Missing "MISSING ENDPOINT: POST /api/auth/admin-create"
    return [pscustomobject]@{ ok = $false; reason = "admin-create missing" }
  }
  if (-not $c.ok -and $c.status -ne 400) {
    return [pscustomobject]@{ ok = $false; reason = (Err $c) }
  }
  $l2 = Login $email $pass
  if ($l2.ok) {
    if (([string]$l2.user.role).ToUpperInvariant() -ne $role) {
      Add-Warn "$email logged in as $($l2.user.role), expected $role."
    }
    return $l2
  }
  return [pscustomobject]@{ ok = $false; reason = "Could not login after admin-create: $($l2.reason)" }
}

function SaveUser([string]$key, [string]$fallback, [object]$auth) {
  if (-not $auth.ok) { return }
  $u = $auth.user
  $email = $fallback
  $id = ""
  $role = $key
  if ($u) {
    $pn = @($u.PSObject.Properties.Name)
    if ($pn -contains "email") { $email = [string]$u.email }
    if ($pn -contains "id") { $id = [string]$u.id }
    if ($pn -contains "role") { $role = [string]$u.role }
  }
  $res.users[$key] = [ordered]@{ role = $role; email = $email; userId = $id; token = [string]$auth.token }
}

function ParentChildren([string]$t) {
  $r = Api GET "/api/parent/parent/children" $t
  if (-not $r.ok) {
    Add-Warn "parent children failed: $(Err $r)"
    return @()
  }
  return @(Arr $r.body)
}

function ParentReqs([string]$t) {
  $r = Api GET "/api/parent/parent/link-requests" $t
  if (-not $r.ok) {
    Add-Warn "parent link-requests failed: $(Err $r)"
    return @()
  }
  return @(Arr $r.body)
}

function ApproveReq([string]$a, [string]$id) {
  if (-not $a -or -not $id) { return }
  $r = Api POST "/api/parent/admin/parent/link-requests/$id/decide" $a @{ decision = "APPROVED" }
  if (-not $r.ok) {
    Add-Warn "approve link request $id failed: $(Err $r)"
  }
}

function EnsureLink([string]$pt, [string]$at, [string]$childKey, [string]$childEmail) {
  $children = @(ParentChildren $pt)
  $hit = $children | Where-Object { ([string]$_.email).Equals($childEmail, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
  if ($hit) { return $children }

  $req = @(ParentReqs $pt) | Where-Object {
    $c = [string]$_.childId
    $c.Equals($childKey, [System.StringComparison]::OrdinalIgnoreCase) -or
    $c.Equals($childEmail, [System.StringComparison]::OrdinalIgnoreCase)
  } | Select-Object -First 1

  if ($req -and ([string]$req.status).ToUpperInvariant() -eq "PENDING") {
    if ($at) { ApproveReq $at ([string]$req.id) } else { Add-Missing "Pending link request for $childKey requires ADMIN approval." }
  }

  $children = @(ParentChildren $pt)
  $hit = $children | Where-Object { ([string]$_.email).Equals($childEmail, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
  if ($hit) { return $children }

  $c = Api POST "/api/parent/parent/link-requests" $pt @{ childId = $childKey }
  if (-not $c.ok -and $c.status -ne 200) {
    Add-Warn "link-request create failed for ${childKey}: $(Err $c)"
    return @(ParentChildren $pt)
  }

  $status = ""
  $rid = ""
  if ($c.body) {
    $cp = @($c.body.PSObject.Properties.Name)
    if ($cp -contains "status") { $status = [string]$c.body.status }
    if ($cp -contains "id") { $rid = [string]$c.body.id }
  }

  if ($status.ToUpperInvariant() -eq "PENDING") {
    if ($at -and $rid -and $rid -ne "already-linked") {
      ApproveReq $at $rid
    } else {
      Add-Missing "Link request for $childKey is pending and cannot be auto-approved without ADMIN token."
    }
  }

  return @(ParentChildren $pt)
}
function EnsureCalendar([string]$studentToken, [string]$parentToken, [string]$childId) {
  if (-not $studentToken) {
    Add-Missing "Cannot seed child calendar without STUDENT token."
    return 0
  }

  $list = Api GET "/api/calendar?limit=100" $studentToken
  if (-not $list.ok) {
    Add-Warn "student calendar list failed: $(Err $list)"
    return 0
  }

  $items = @(Arr $list.body)
  $d = [DateTime]::UtcNow.Date.AddDays(1)
  $specs = @(
    @{ title = "Demo Calendar - Mathematics Revision"; description = "Prepare for next assessment"; location = "Room A"; startsAt = $d.AddHours(8).ToString("o"); endsAt = $d.AddHours(9).ToString("o") },
    @{ title = "Demo Calendar - Science Lab"; description = "Bring lab coat and workbook"; location = "Lab 2"; startsAt = $d.AddDays(1).AddHours(10).ToString("o"); endsAt = $d.AddDays(1).AddHours(11).ToString("o") }
  )

  foreach ($s in $specs) {
    $exists = $items | Where-Object { ([string]$_.title) -eq $s.title } | Select-Object -First 1
    if (-not $exists) {
      $cr = Api POST "/api/calendar" $studentToken $s
      if (-not $cr.ok) { Add-Warn "calendar create '$($s.title)' failed: $(Err $cr)" }
    }
  }

  $pv = Api GET ("/api/calendar?limit=100&childId=$([System.Uri]::EscapeDataString($childId))") $parentToken
  if (-not $pv.ok) {
    Add-Warn "parent calendar verification failed: $(Err $pv)"
    return 0
  }
  return (@(Arr $pv.body)).Count
}

function EnsureResults([string]$staffToken, [string]$parentToken, [string]$childKey) {
  if (-not $staffToken) {
    Add-Missing "Cannot seed results without ADMIN/LECTURER token."
    return 0
  }

  $ek = [System.Uri]::EscapeDataString($childKey)
  $l = Api GET "/api/parent/admin/results?childId=$ek" $staffToken
  if ($l.status -eq 404) {
    Add-Missing "MISSING ENDPOINT: GET /api/parent/admin/results"
    return 0
  }
  if (-not $l.ok) {
    Add-Warn "admin results list failed: $(Err $l)"
    return 0
  }

  $items = @(Arr $l.body)
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $specs = @(
    @{ subject = "Demo Mathematics"; score = 82; outOf = 100; date = $today },
    @{ subject = "Demo English"; score = 76; outOf = 100; date = $today }
  )

  foreach ($s in $specs) {
    $exists = $items | Where-Object {
      ([string]$_.subject) -eq $s.subject -and
      [int]$_.score -eq $s.score -and
      [int]$_.outOf -eq $s.outOf -and
      ([string]$_.date) -eq $s.date
    } | Select-Object -First 1

    if (-not $exists) {
      $cr = Api POST "/api/parent/admin/results" $staffToken @{ childId = $childKey; subject = $s.subject; score = $s.score; outOf = $s.outOf; date = $s.date }
      if ($cr.status -eq 404) {
        Add-Missing "MISSING ENDPOINT: POST /api/parent/admin/results"
      } elseif (-not $cr.ok) {
        Add-Warn "result create '$($s.subject)' failed: $(Err $cr)"
      }
    }
  }

  $pr = Api GET "/api/parent/parent/results?childId=$ek" $parentToken
  if (-not $pr.ok) {
    Add-Warn "parent results verification failed: $(Err $pr)"
    return 0
  }
  return (@(Arr $pr.body)).Count
}

function EnsureFinance([string]$parentToken, [string]$childKey) {
  $ek = [System.Uri]::EscapeDataString($childKey)
  $f = Api GET "/api/parent/parent/finance?childId=$ek" $parentToken
  if (-not $f.ok) {
    Add-Warn "parent finance verification failed: $(Err $f)"
    return 0
  }

  $docs = @()
  if ($f.body -and (@($f.body.PSObject.Properties.Name) -contains "documents")) {
    $docs = @(Arr $f.body.documents)
  }

  if ($docs.Count -lt 1) {
    Add-Missing "MISSING ENDPOINT: No finance write endpoint to seed notices/documents (read-only finance APIs)."
  }

  return $docs.Count
}

function EnsureChannelAnns([string]$staffToken, [string]$parentToken) {
  if (-not $staffToken) { Fail "Cannot seed channels/announcements without ADMIN/LECTURER token." $null $null }
  if (-not $parentToken) { Fail "Cannot verify parent announcement visibility without PARENT token." $null $null }

  $cl = Api GET "/api/channels" $staffToken
  if (-not $cl.ok) { Fail "channels list failed before announcement seeding." $cl $null }

  $chs = @(Arr $cl.body)
  $ch = $chs | Where-Object { ([string]$_.name) -eq "Demo Public Channel" -and -not [bool]$_.isPrivate } | Select-Object -First 1
  if (-not $ch) { $ch = $chs | Where-Object { -not [bool]$_.isPrivate } | Select-Object -First 1 }

  if (-not $ch) {
    $cc = Api POST "/api/channels" $staffToken @{ name = "Demo Public Channel"; type = "FACULTY"; isPrivate = $false }
    if (-not $cc.ok) { Fail "channel create failed for demo announcements." $cc $null }
    $ch = $cc.body
  }

  $id = [string]$ch.id
  if (-not $id) { Fail "channel id missing while seeding announcements." $null $ch }

  $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $specs = @(
    @{ title = "Demo CEO Announcement 1 [$stamp]"; body = "Welcome to the D6 Student Communicator CEO walkthrough."; pinned = $true },
    @{ title = "Demo CEO Announcement 2 [$stamp]"; body = "Parent portal, uploads, and messaging are live and connected."; pinned = $false }
  )

  foreach ($s in $specs) {
    $cr = Api POST "/api/channels/$id/announcements" $staffToken $s
    if (-not $cr.ok) { Fail ("announcement create failed for title '{0}'." -f $s.title) $cr $null }
  }

  $sv = Api GET "/api/channels/$id/announcements" $staffToken
  if (-not $sv.ok) { Fail "announcement list verification failed for ADMIN/LECTURER." $sv $null }
  $svItems = @(Arr $sv.body)
  foreach ($s in $specs) {
    $seen = $svItems | Where-Object { ([string]$_.title) -eq $s.title } | Select-Object -First 1
    if (-not $seen) { Fail ("announcement title missing for staff list: '{0}'." -f $s.title) $sv $null }
  }

  $pv = Api GET "/api/channels/$id/announcements" $parentToken
  if (-not $pv.ok) { Fail "parent announcement list verification failed." $pv $null }
  $pvItems = @(Arr $pv.body)
  foreach ($s in $specs) {
    $seen = $pvItems | Where-Object { ([string]$_.title) -eq $s.title } | Select-Object -First 1
    if (-not $seen) { Fail ("parent cannot view announcement title '{0}'." -f $s.title) $pv $null }
  }

  return [pscustomobject]@{
    channelId = $id
    count = $pvItems.Count
    verifiedToParent = $true
    titles = @($specs | ForEach-Object { [string]$_.title })
  }
}
function UploadPost([string]$token, [string]$filePath) {
  $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, (U "/api/uploads"))
  $req.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
  $multi = [System.Net.Http.MultipartFormDataContent]::new()

  try {
    [void]$multi.Add([System.Net.Http.StringContent]::new("LECTURER_MATERIAL"), "kind")

    $full = (Resolve-Path -LiteralPath $filePath).Path
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $name = [System.IO.Path]::GetFileName($full)

    $fc = [System.Net.Http.ByteArrayContent]::new($bytes)
    $fc.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/plain")
    [void]$multi.Add($fc, "file", $name)

    $req.Content = $multi

    try {
      $resp = $script:http.SendAsync($req).GetAwaiter().GetResult()
    } catch {
      return [pscustomobject]@{ ok = $false; status = 0; body = $null; raw = $_.Exception.Message }
    }

    try {
      $raw = ""
      if ($resp.Content) { $raw = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult() }
      $obj = $null
      if ($raw) { $obj = Parse-Json $raw }
      $s = [int]$resp.StatusCode
      return [pscustomobject]@{ ok = ($s -ge 200 -and $s -lt 300); status = $s; body = $obj; raw = $raw }
    } finally {
      $resp.Dispose()
    }
  } finally {
    $req.Dispose()
    $multi.Dispose()
  }
}

function DownloadBinary([string]$token, [string]$path) {
  $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, (U $path))
  $req.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)

  try {
    $resp = $script:http.SendAsync($req).GetAwaiter().GetResult()
  } catch {
    return [pscustomobject]@{ ok = $false; status = 0; bytes = 0; raw = $_.Exception.Message }
  } finally {
    $req.Dispose()
  }

  try {
    $s = [int]$resp.StatusCode
    $bytes = @()
    if ($resp.Content) {
      $bytes = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    }
    $isOk = ($s -ge 200 -and $s -lt 300)
    $raw = ""
    if ($bytes.Count -gt 0) {
      try { $raw = [System.Text.Encoding]::UTF8.GetString($bytes) } catch {}
    }
    return [pscustomobject]@{ ok = $isOk; status = $s; bytes = [int]$bytes.Count; raw = $raw }
  } finally {
    $resp.Dispose()
  }
}

function EnsureUpload([string]$staffToken, [string]$parentToken, [string]$studentToken) {
  if (-not $staffToken) { Fail "Cannot seed uploads without ADMIN/LECTURER token." $null $null }

  $uploadFile = Join-Path $PSScriptRoot "demo-upload.txt"
  Set-Content -Path $uploadFile -Value ("D6 demo upload generated at " + [DateTime]::UtcNow.ToString("o")) -Encoding UTF8

  $up = UploadPost $staffToken $uploadFile
  if (-not $up.ok) { Fail "upload failed for scripts/demo-upload.txt." $up $null }

  $id = ""
  if ($up.body -and (@($up.body.PSObject.Properties.Name) -contains "id")) {
    $id = [string]$up.body.id
  }
  if (-not $id) { Fail "upload id missing in upload create response." $up $null }

  $staffList = Api GET "/api/uploads" $staffToken
  if (-not $staffList.ok) { Fail "staff uploads list failed after upload." $staffList $null }
  $staffItems = @(Arr $staffList.body)
  $staffSeen = $staffItems | Where-Object {
    ([string]$_.id) -eq $id -and ([string]$_.originalName) -eq "demo-upload.txt"
  } | Select-Object -First 1
  if (-not $staffSeen) { Fail "uploaded file not found in staff /api/uploads list." $staffList @{ expectedId = $id; expectedOriginalName = "demo-upload.txt" } }

  $verifiedBy = ""
  $downloadBytes = 0
  $parentList = $null
  $parentDownload = $null
  $studentList = $null
  $studentDownload = $null

  if ($parentToken) {
    $parentList = Api GET "/api/uploads" $parentToken
    if ($parentList.ok) {
      $pSeen = @(Arr $parentList.body) | Where-Object { ([string]$_.id) -eq $id } | Select-Object -First 1
      if ($pSeen) {
        $parentDownload = DownloadBinary $parentToken "/api/uploads/$id/download"
        if ($parentDownload.ok -and [int]$parentDownload.bytes -gt 0) {
          $verifiedBy = "PARENT"
          $downloadBytes = [int]$parentDownload.bytes
        }
      }
    }
  }

  if (-not $verifiedBy -and $studentToken) {
    $studentList = Api GET "/api/uploads" $studentToken
    if ($studentList.ok) {
      $sSeen = @(Arr $studentList.body) | Where-Object { ([string]$_.id) -eq $id } | Select-Object -First 1
      if ($sSeen) {
        $studentDownload = DownloadBinary $studentToken "/api/uploads/$id/download"
        if ($studentDownload.ok -and [int]$studentDownload.bytes -gt 0) {
          $verifiedBy = "STUDENT"
          $downloadBytes = [int]$studentDownload.bytes
        }
      }
    }
  }

  if (-not $verifiedBy) {
    $ctx = @{
      uploadId = $id
      parentListStatus = if ($parentList) { [int]$parentList.status } else { -1 }
      parentListBody = if ($parentList) { (Raw $parentList) } else { "(none)" }
      parentDownloadStatus = if ($parentDownload) { [int]$parentDownload.status } else { -1 }
      parentDownloadBody = if ($parentDownload) { [string]$parentDownload.raw } else { "(none)" }
      studentListStatus = if ($studentList) { [int]$studentList.status } else { -1 }
      studentListBody = if ($studentList) { (Raw $studentList) } else { "(none)" }
      studentDownloadStatus = if ($studentDownload) { [int]$studentDownload.status } else { -1 }
      studentDownloadBody = if ($studentDownload) { [string]$studentDownload.raw } else { "(none)" }
    }
    Fail "Parent/Student could not verify allowed upload list+download access." $null $ctx
  }

  return [pscustomobject]@{
    id = $id
    downloadBytes = $downloadBytes
    verifiedBy = $verifiedBy
    verified = $true
  }
}

function EnsureMessaging([string]$parentToken, [string]$staffToken, [string]$staffEmail) {
  if (-not $parentToken -or -not $staffToken) {
    Add-Missing "Cannot seed messaging without parent and staff tokens."
    return ""
  }

  $cr = Api POST "/api/threads" $parentToken @{ participantEmails = @($staffEmail) }
  if ($cr.status -eq 404) {
    Add-Missing "MISSING ENDPOINT: /api/threads"
    return ""
  }
  if (-not $cr.ok) {
    Add-Warn "thread create/find failed: $(Err $cr)"
    return ""
  }

  $id = [string]$cr.body.id
  if (-not $id) {
    Add-Warn "thread id missing."
    return ""
  }

  $pmsg = "Demo: Hello lecturer, parent messaging check."
  $smsg = "Demo: Hello parent, lecturer reply confirmed."

  $ml = Api GET "/api/threads/$id/messages?limit=100" $parentToken
  $msgs = if ($ml.ok) { @(Arr $ml.body) } else { @() }
  if (-not $ml.ok) { Add-Warn "thread messages list failed: $(Err $ml)" }

  $hasP = $msgs | Where-Object { ([string]$_.body) -eq $pmsg } | Select-Object -First 1
  $hasS = $msgs | Where-Object { ([string]$_.body) -eq $smsg } | Select-Object -First 1

  if (-not $hasP) {
    $sp = Api POST "/api/threads/$id/messages" $parentToken @{ body = $pmsg }
    if (-not $sp.ok) { Add-Warn "parent message send failed: $(Err $sp)" }
  }

  if (-not $hasS) {
    $ss = Api POST "/api/threads/$id/messages" $staffToken @{ body = $smsg }
    if (-not $ss.ok) { Add-Warn "staff message send failed: $(Err $ss)" }
  }

  $tl = Api GET "/api/threads?limit=50" $parentToken
  if ($tl.ok) {
    $f = @(Arr $tl.body) | Where-Object { ([string]$_.id) -eq $id } | Select-Object -First 1
    if (-not $f) { Add-Warn "parent thread list missing $id" }
  } else {
    Add-Warn "parent thread list failed: $(Err $tl)"
  }

  return $id
}
try {
  Write-Host "D6 demo bootstrap started"
  Write-Host "BaseUrl: $BaseUrl"

  $h = Api GET "/api/health" ""
  if (-not $h.ok) { throw "Backend unreachable: $(Err $h)" }
  Write-Host "Health check OK"
  $dbBefore = Try-DbUserSummary

  $parent = EnsureParent $demo.PARENT $demoPass
  if (-not $parent.ok) { throw "Parent setup failed: $($parent.reason)" }
  SaveUser "PARENT" $demo.PARENT $parent

  if (([string]$parent.user.role).ToUpperInvariant() -ne "PARENT") {
    Add-Warn "Expected PARENT role, got $($parent.user.role)"
  }

  $bootstrapEmail = $BootstrapAdminEmail
  $bootstrapPassword = $BootstrapAdminPassword
  if ((-not $bootstrapEmail -or -not $bootstrapPassword)) {
    $envCreds = Try-AdminCredsFromEnv
    if ($envCreds.ok) {
      if (-not $bootstrapEmail) { $bootstrapEmail = [string]$envCreds.email }
      if (-not $bootstrapPassword) { $bootstrapPassword = [string]$envCreds.password }
      if ($bootstrapEmail -and $bootstrapPassword) {
        Write-Host ("Using bootstrap admin credentials from {0}" -f [string]$envCreds.source)
      }
    }
  }

  $admin = Login $demo.ADMIN $demoPass
  if (-not $admin.ok -and $bootstrapEmail -and $bootstrapPassword) {
    $boot = Login $bootstrapEmail $bootstrapPassword
    if ($boot.ok -and ([string]$boot.user.role).ToUpperInvariant() -eq "ADMIN") {
      $c = Api POST "/api/auth/admin-create" $boot.token @{ email = $demo.ADMIN; password = $demoPass; role = "ADMIN" }
      if ($c.status -eq 404) { Add-Missing "MISSING ENDPOINT: POST /api/auth/admin-create" }
      $admin = Login $demo.ADMIN $demoPass
      if (-not $admin.ok) {
        $admin = $boot
        Add-Warn "Using bootstrap admin token because admin_demo login failed."
      }
    } elseif ($boot.ok) {
      Add-Warn "Bootstrap user role is $($boot.user.role), expected ADMIN."
    } else {
      Add-Warn "Bootstrap admin login failed: $($boot.reason)"
    }
  }

  if ($admin.ok) {
    SaveUser "ADMIN" $demo.ADMIN $admin
  } else {
    $dbInfo = Try-DbUserSummary
    $promoteTarget = if ($PromoteEmailToAdmin) { $PromoteEmailToAdmin } else { [string]$parent.user.email }
    if ($dbBefore -and $dbBefore.ok -and [int]$dbBefore.userCount -eq 0) {
      Write-Host "Detected zero users before bootstrap. Parent user was created and can be promoted to ADMIN for local demo."
    }
    Print-AdminPromotionHelp $promoteTarget $dbInfo
    throw "No ADMIN token available."
  }

  $adminToken = if ($admin.ok) { [string]$admin.token } else { "" }

  $lect = EnsureRole "LECTURER" $demo.LECTURER $demoPass $adminToken
  if ($lect.ok) { SaveUser "LECTURER" $demo.LECTURER $lect }

  $stud = EnsureRole "STUDENT" $demo.STUDENT $demoPass $adminToken
  if ($stud.ok) { SaveUser "STUDENT" $demo.STUDENT $stud }

  $stud2 = EnsureRole "STUDENT" $demo.STUDENT2 $demoPass $adminToken
  if ($stud2.ok) { SaveUser "STUDENT2" $demo.STUDENT2 $stud2 }

  $pt = [string]$parent.token
  $studentToken = if ($stud.ok) { [string]$stud.token } else { "" }

  if ($stud.ok) { [void](EnsureLink $pt $adminToken $demo.STUDENT $demo.STUDENT) }
  if ($stud2.ok) { [void](EnsureLink $pt $adminToken $demo.STUDENT2 $demo.STUDENT2) }

  $children = @(ParentChildren $pt)
  $res.linkedChildren = @($children | ForEach-Object { [string]$_.id })

  $primary = $null
  if ($stud.ok) {
    $primary = $children | Where-Object {
      ([string]$_.email).Equals($demo.STUDENT, [System.StringComparison]::OrdinalIgnoreCase)
    } | Select-Object -First 1
  }
  if (-not $primary -and $children.Count -gt 0) { $primary = $children[0] }

  if (-not $primary) {
    Fail "Parent is not linked to a student child after link setup." $null @{ children = $children }
  } else {
    $childId = [string]$primary.id
    $childKey = [string]$primary.email

    if ($childKey) {
      $res.financeDocCount = EnsureFinance $pt $childKey
      $staff = if ($lect.ok) { $lect } elseif ($admin.ok) { $admin } else { $null }
      $staffToken = if ($staff) { [string]$staff.token } else { "" }
      $res.resultCount = EnsureResults $staffToken $pt $childKey
    }

    if ($childId) {
      Add-Warn "Calendar entries are user-scoped. Seeding child calendar with STUDENT token for parent child-view."
      $res.calendarCount = EnsureCalendar $studentToken $pt $childId
    }
  }

  $staffForContent = if ($lect.ok) { $lect } elseif ($admin.ok) { $admin } else { $null }
  $staffTok = if ($staffForContent) { [string]$staffForContent.token } else { "" }

  $ann = EnsureChannelAnns $staffTok $pt
  $res.channelId = [string]$ann.channelId
  $res.announcementCount = [int]$ann.count
  $res.announcementsVerifiedToParent = [bool]$ann.verifiedToParent

  $up = EnsureUpload $staffTok $pt $studentToken
  $res.uploadId = [string]$up.id
  $res.uploadDownloadBytes = [int]$up.downloadBytes
  $res.uploadVerifiedVia = [string]$up.verifiedBy
  $res.uploadsVerifiedDownload = [bool]$up.verified

  $staffForMsg = if ($lect.ok) { $lect } elseif ($admin.ok) { $admin } else { $null }
  if ($staffForMsg) {
    $res.threadId = EnsureMessaging $pt ([string]$staffForMsg.token) ([string]$staffForMsg.user.email)
  } else {
    Add-Missing "Cannot seed messaging thread because no lecturer/admin user is available."
  }

  Write-Host ""
  Write-Host "DEMO READY SUMMARY"

  $keyRoles = @("ADMIN", "LECTURER", "STUDENT", "PARENT")
  foreach ($k in $keyRoles) {
    if ($res.users.Contains($k)) {
      $u = $res.users[$k]
      Write-Host ("- {0} email: {1} | userId={2}" -f $k, $u.email, $u.userId)
    } else {
      Write-Host ("- {0} email: (none)" -f $k)
    }
  }
  if ($res.users.Contains("STUDENT2")) {
    $u2 = $res.users["STUDENT2"]
    Write-Host ("- STUDENT2 email: {0} | userId={1}" -f $u2.email, $u2.userId)
  }

  $linked = if (@($res.linkedChildren).Count -gt 0) { $res.linkedChildren -join ", " } else { "(none)" }
  $cid = if ($res.channelId) { $res.channelId } else { "(none)" }
  $uid = if ($res.uploadId) { $res.uploadId } else { "(none)" }
  $tid = if ($res.threadId) { $res.threadId } else { "(none)" }
  $downloadBytes = [int]$res.uploadDownloadBytes
  $uploadVerifiedBy = if ($res.uploadVerifiedVia) { [string]$res.uploadVerifiedVia } else { "(none)" }
  $annYesNo = if ([bool]$res.announcementsVerifiedToParent) { "YES" } else { "NO" }
  $uploadYesNo = if ([bool]$res.uploadsVerifiedDownload) { "YES" } else { "NO" }

  Write-Host ("- Parent linked childId(s): {0}" -f $linked)
  Write-Host ("- ChannelId used for announcements: {0}" -f $cid)
  Write-Host ("- Upload id + confirmed download bytes: {0} | bytes={1} | verifiedBy={2}" -f $uid, $downloadBytes, $uploadVerifiedBy)
  Write-Host ("- Thread id used for messaging: {0}" -f $tid)
  Write-Host ("- Parent calendar items visible: {0}" -f [int]$res.calendarCount)
  Write-Host ("- Parent results items visible: {0}" -f [int]$res.resultCount)
  Write-Host ("- Parent finance documents visible: {0}" -f [int]$res.financeDocCount)
  Write-Host ("- Parent visible announcements in selected channel: {0}" -f [int]$res.announcementCount)
  Write-Host ("- Lecturer/Admin can create announcements: YES")
  Write-Host ("- Parent/Student can view announcements: {0}" -f $annYesNo)
  Write-Host ("- Lecturer/Admin can upload: YES")
  Write-Host ("- Parent/Student can view/download allowed uploads: {0}" -f $uploadYesNo)
  Write-Host ("- Announcements verified visible to Parent: {0}" -f $annYesNo)
  Write-Host ("- Uploads verified downloadable by Parent/Student: {0}" -f $uploadYesNo)

  if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "MISSING ENDPOINT / CAPABILITY"
    foreach ($m in $missing.Keys) { Write-Host "- $m" }
  }

  if ($warn.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNINGS"
    foreach ($w in $warn.Keys) { Write-Host "- $w" }
  }

  Write-Host ""
  Write-Host "Demo ready"
}
finally {
  if ($script:http) { $script:http.Dispose() }
}

