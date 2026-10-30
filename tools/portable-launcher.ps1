param([switch]$NoBrowser, [switch]$NoNotification, [switch]$NoGame)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$logs = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
function Status([string]$message) {
    Write-Host $message
    if ($label) { $label.Text = $message; [System.Windows.Forms.Application]::DoEvents() }
}
function Ready {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        $page = Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
        return $health.service -eq 'Isometric Auto Studio' -and $page.StatusCode -eq 200 -and $page.Content -match 'Auto 3Q Studio'
    } catch { return $false }
}
function Occupied([int]$port) {
    $socket = New-Object Net.Sockets.TcpClient
    try { $task = $socket.ConnectAsync('127.0.0.1', $port); return $task.Wait(700) -and $socket.Connected } catch { return $false } finally { $socket.Dispose() }
}
function Alert([string]$text, [bool]$failed) {
    Write-Host $text
    Add-Content (Join-Path $logs 'launcher.log') "$(Get-Date -Format s) $text"
    if ($form) { $form.Close(); $form.Dispose(); $script:form = $null }
    if (-not $NoNotification) {
        $icon = if ($failed) { [System.Windows.Forms.MessageBoxIcon]::Error } else { [System.Windows.Forms.MessageBoxIcon]::Information }
        [System.Windows.Forms.MessageBox]::Show($text, 'Auto 3Q Studio', 'OK', $icon) | Out-Null
    }
}
$mutex = New-Object Threading.Mutex($false, 'Local\IsometricAutoStudioLauncher')
$locked = $false
try {
    $locked = $mutex.WaitOne(0)
    if (-not $locked) { throw 'Another launcher is running.' }
    if (-not $NoNotification) {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $form = New-Object System.Windows.Forms.Form
        $form.Text = 'Auto 3Q Studio - Khoi dong'
        $form.Size = New-Object System.Drawing.Size(440, 145)
        $form.StartPosition = 'CenterScreen'
        $form.FormBorderStyle = 'FixedDialog'
        $form.ControlBox = $false
        $label = New-Object System.Windows.Forms.Label
        $label.Location = New-Object System.Drawing.Point(20, 15)
        $label.Size = New-Object System.Drawing.Size(390, 45)
        $bar = New-Object System.Windows.Forms.ProgressBar
        $bar.Location = New-Object System.Drawing.Point(20, 75)
        $bar.Size = New-Object System.Drawing.Size(390, 20)
        $bar.Style = 'Marquee'
        $form.Controls.Add($label)
        $form.Controls.Add($bar)
        $form.Show()
    }
    Status 'Dang kiem tra backend va frontend...'
    if (-not (Ready)) {
        if ((Occupied 8000) -or (Occupied 5173)) { throw 'Port 8000 or 5173 is occupied by another service. Nothing was stopped.' }
        $backend = Join-Path $root 'studio-backend\studio-backend.exe'
        $frontend = Join-Path $root 'frontend\dist\index.html'
        if (-not (Test-Path $backend) -or -not (Test-Path $frontend)) { throw 'Incomplete portable package: backend executable or frontend build missing.' }
        Status 'Dang khoi dong backend...'
        $be = Start-Process -FilePath $backend -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'backend.stdout.log') -RedirectStandardError (Join-Path $logs 'backend.stderr.log') -PassThru
        Status 'Dang khoi dong frontend...'
        $fe = Start-Process -FilePath $backend -ArgumentList '--frontend-only' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'frontend.stdout.log') -RedirectStandardError (Join-Path $logs 'frontend.stderr.log') -PassThru
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Ready)) {
            if ($be.HasExited -or $fe.HasExited) { throw 'Service exited. Inspect data\logs backend/frontend stderr.' }
            if ((Get-Date) -ge $deadline) { throw 'Service startup timed out. Inspect data\logs.' }
            Start-Sleep -Milliseconds 300
            if ($form) { [System.Windows.Forms.Application]::DoEvents() }
        }
    }
    if (-not $NoBrowser) {
        try { Start-Process 'http://127.0.0.1:5173/' | Out-Null }
        catch { Status 'Trinh duyet khong mo duoc; mo http://127.0.0.1:5173/ thu cong.' }
    }
    if (-not $NoGame) {
        Status 'Dang mo BlueStacks va Game 3Q...'
        $job = Start-Job -ScriptBlock { Invoke-RestMethod 'http://127.0.0.1:8000/api/devices/launch-game' -Method Post -TimeoutSec 120 }
        try {
            while (-not (Wait-Job $job -Timeout 1)) { if ($form) { [System.Windows.Forms.Application]::DoEvents() } }
            $result = Receive-Job $job -ErrorAction Stop
            $game = "Game 3Q: OK ($($result.serial))"
        } catch { $game = "Game 3Q: LOI - $($_.Exception.Message). Co the mo game tu giao dien." }
        finally { Remove-Job $job -Force -ErrorAction SilentlyContinue }
    } else { $game = 'Game launch skipped.' }
    Alert "Studio san sang: http://127.0.0.1:5173/`r`n$game`r`nLogs: $logs" $false
} catch {
    Alert "Khoi dong that bai: $($_.Exception.Message)`r`nLogs: $logs" $true
    exit 1
} finally {
    if ($form) { $form.Dispose() }
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
