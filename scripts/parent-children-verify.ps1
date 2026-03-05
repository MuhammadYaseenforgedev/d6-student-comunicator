param(
  [string]$ParentEmail = "demo+parent@local.test",
  [string]$ParentPassword = "DemoPass123"
)

# If this demo account is not seeded in your environment, replace -ParentEmail and -ParentPassword
# with an existing PARENT account before running the script.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$api = "https://d6-student-comunicator.onrender.com"

function Get-ErrorBody {
  param([System.Exception]$Exception)

  try {
    if ($null -eq $Exception -or $null -eq $Exception.Response) { return "" }
    $stream = $Exception.Response.GetResponseStream()
    if ($null -eq $stream) { return "" }
    $reader = New-Object System.IO.StreamReader($stream)
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } catch {
    return ""
  }
}

function Invoke-ApiJson {
  param(
    [ValidateSet("GET", "POST", "PATCH", "PUT", "DELETE")]
    [string]$Method,
    [string]$Path,
    [hashtable]$Body,
    [string]$Token
  )

  $uri = "{0}{1}" -f $api.TrimEnd("/"), $Path
  $headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $headers["Authorization"] = "Bearer $Token"
  }

  try {
    if ($PSBoundParameters.ContainsKey("Body")) {
      $json = $Body | ConvertTo-Json -Depth 10
      return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json
    }

    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  } catch {
    $raw = Get-ErrorBody -Exception $_.Exception
    $statusCode = ""
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [string][int]$_.Exception.Response.StatusCode
      }
    } catch {}

    $message = ""
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
      try {
        $errObj = $raw | ConvertFrom-Json
        if ($errObj.error -and $errObj.error.message) {
          $message = [string]$errObj.error.message
        } elseif ($errObj.message) {
          $message = [string]$errObj.message
        }
      } catch {}
    }

    if ([string]::IsNullOrWhiteSpace($message)) {
      $message = $_.Exception.Message
    }

    if (-not [string]::IsNullOrWhiteSpace($statusCode)) {
      throw ("HTTP {0}: {1}`n{2}" -f $statusCode, $message, $raw)
    }

    throw ("HTTP request failed: {0}`n{1}" -f $message, $raw)
  }
}

function Get-PropString {
  param(
    [object]$Row,
    [string[]]$Names
  )

  foreach ($name in $Names) {
    if ($null -eq $Row) { continue }
    if ($Row.PSObject.Properties.Name -contains $name) {
      $value = $Row.$name
      if ($null -ne $value) {
        return [string]$value
      }
    }
  }

  return ""
}

Write-Host ("API: {0}" -f $api)
Write-Host ("Parent email: {0}" -f $ParentEmail)

$otpRes = Invoke-ApiJson -Method "POST" -Path "/api/auth/request-otp" -Body @{
  email = $ParentEmail
  purpose = "LOGIN"
}

$otp = ""
if ($otpRes.PSObject.Properties.Name -contains "devOtp") {
  $otp = [string]$otpRes.devOtp
} elseif ($otpRes.PSObject.Properties.Name -contains "devCode") {
  $otp = [string]$otpRes.devCode
}

if ([string]::IsNullOrWhiteSpace($otp)) {
  throw "No dev OTP returned. Use an account that supports dev OTP response or configure OTP_RETURN_DEV_CODE=true."
}

Write-Host ("OTP received (length {0})" -f $otp.Length)

$loginRes = Invoke-ApiJson -Method "POST" -Path "/api/auth/login" -Body @{
  email = $ParentEmail
  password = $ParentPassword
  otp = $otp
}

$token = ""
if ($loginRes.PSObject.Properties.Name -contains "token") {
  $token = [string]$loginRes.token
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Login response did not include token."
}

Write-Host "Login successful."

$childrenRes = Invoke-ApiJson -Method "GET" -Path "/api/parent/children" -Token $token

Write-Host ""
Write-Host "Raw /api/parent/children response:"
$childrenRes | ConvertTo-Json -Depth 10

$rows = @()
if ($childrenRes -is [System.Array]) {
  $rows = @($childrenRes)
} elseif ($childrenRes.PSObject.Properties.Name -contains "value" -and $childrenRes.value -is [System.Array]) {
  $rows = @($childrenRes.value)
} elseif ($childrenRes.PSObject.Properties.Name -contains "data" -and $childrenRes.data -is [System.Array]) {
  $rows = @($childrenRes.data)
} elseif ($childrenRes.PSObject.Properties.Name -contains "items" -and $childrenRes.items -is [System.Array]) {
  $rows = @($childrenRes.items)
}

$summary = @()
foreach ($row in $rows) {
  $publicStudentId = Get-PropString -Row $row -Names @("publicStudentId", "studentNumber", "public_student_id")
  $summary += [pscustomobject]@{
    email = Get-PropString -Row $row -Names @("email")
    role = Get-PropString -Row $row -Names @("role")
    publicStudentId = $publicStudentId
    id = Get-PropString -Row $row -Names @("id")
    userId = Get-PropString -Row $row -Names @("userId")
    childUserId = Get-PropString -Row $row -Names @("childUserId")
    studentUserId = Get-PropString -Row $row -Names @("studentUserId")
  }
}

Write-Host ""
Write-Host "Child summary:"
if ($summary.Count -eq 0) {
  Write-Host "(no linked children returned)"
} else {
  $summary | Format-Table -AutoSize
}
