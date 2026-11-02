param(
    [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),
    [switch]$NoNotification,
    [switch]$NoBrowser,
    [switch]$SkipGameLaunch
)
$ErrorActionPreference = 'Stop'
$ProjectDir = [IO.Path]::GetFullPath($ProjectDir)
$logs = Join-Path $ProjectDir 'data\logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$mutex = New-Object Threading.Mutex($false, 'Local\IsometricAutoStudioLauncher')
$lockAcquired = $false
$progressForm = $null
$progressLabel = $null
function Set-LauncherProgress([string]$Message) {
    Write-Host $Message
    if ($progressForm -and -not $progressForm.IsDisposed) {
        $progressLabel.Text = $Message
        [System.Windows.Forms.Application]::DoEvents()
    }
}
function Start-LauncherProgress {
    if ($NoNotification) { return }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $script:progressForm = New-Object System.Windows.Forms.Form
    $progressForm.Text = 'Auto 3Q Studio - Khoi dong'
    $progressForm.Size = New-Object System.Drawing.Size(440, 150)
    $progressForm.StartPosition = 'CenterScreen'
    $progressForm.FormBorderStyle = 'FixedDialog'
    $progressForm.MaximizeBox = $false
    $progressForm.MinimizeBox = $false
    $progressForm.ControlBox = $false
    $script:progressLabel = New-Object System.Windows.Forms.Label
    $progressLabel.Location = New-Object System.Drawing.Point(20, 18)
    $progressLabel.Size = New-Object System.Drawing.Size(390, 45)
    $progressLabel.Text = 'Dang kiem tra moi truong...'
    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.Location = New-Object System.Drawing.Point(20, 75)
    $bar.Size = New-Object System.Drawing.Size(390, 20)
    $bar.Style = 'Marquee'
    $progressForm.Controls.Add($progressLabel)
    $progressForm.Controls.Add($bar)
    $progressForm.Show()
    [System.Windows.Forms.Application]::DoEvents()
}
function Stop-LauncherProgress {
    if ($progressForm -and -not $progressForm.IsDisposed) { $progressForm.Close(); $progressForm.Dispose() }
}
function Invoke-SetupCommand([string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory, [string]$FailureMessage) {
    $stdout = Join-Path $logs 'setup.stdout.log'
    $stderr = Join-Path $logs 'setup.stderr.log'
    $quotedArgs = ($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = $quotedArgs
    $start.WorkingDirectory = $WorkingDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    try {
        $process.Start() | Out-Null
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        while (-not $process.WaitForExit(250)) {
            if ($progressForm) { [System.Windows.Forms.Application]::DoEvents() }
        }
        $process.WaitForExit()
        [IO.File]::WriteAllText($stdout, $outputTask.Result)
        [IO.File]::WriteAllText($stderr, $errorTask.Result)
        if ($process.ExitCode -ne 0) {
            $details = ($errorTask.Result -split "`n" | Select-Object -Last 8) -join ' '
            throw "$FailureMessage ExitCode=$($process.ExitCode) $details (Logs: $logs)"
        }
    } finally { $process.Dispose() }
}
function Show-LauncherStatus([string]$Message, [bool]$Failed = $false) {
    Add-Content -LiteralPath (Join-Path $logs 'launcher.log') -Value "$(Get-Date -Format s) $Message"
    Write-Host $Message
    Stop-LauncherProgress
    if (-not $NoNotification) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $icon = [System.Windows.Forms.MessageBoxIcon]::Information
            if ($Failed) { $icon = [System.Windows.Forms.MessageBoxIcon]::Error }
            [System.Windows.Forms.MessageBox]::Show($Message, 'Auto 3Q Studio', [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
        } catch { Write-Warning "Cannot show notification. See $logs" }
    }
}
function Open-Studio {
    if ($NoBrowser) { return }
    try {
        Start-Process 'http://127.0.0.1:5173/' | Out-Null
    } catch {
        Add-Content -LiteralPath (Join-Path $logs 'launcher.log') -Value "$(Get-Date -Format s) Browser launch failed: $($_.Exception.Message)"
        Write-Warning 'Cannot open browser automatically. Open http://127.0.0.1:5173/ manually.'
    }
}
function Start-Game {
    if ($SkipGameLaunch) { return 'Game 3Q: skipped (no game input requested).' }
    Set-LauncherProgress 'Dang mo BlueStacks va Game 3Q (toi da 120 giay)...'
    try {
        $request = Start-Job -ScriptBlock { Invoke-RestMethod 'http://127.0.0.1:8000/api/devices/launch-game' -Method Post -TimeoutSec 120 }
        while (-not (Wait-Job $request -Timeout 1)) {
            if ($progressForm) { [System.Windows.Forms.Application]::DoEvents() }
        }
        $game = Receive-Job $request -ErrorAction Stop
        if (-not $game.success) { throw 'Backend did not confirm game launch.' }
        return "Game 3Q: OK ($($game.serial))"
    } catch {
        return "Game 3Q: LOI - $($_.Exception.Message). Xem backend log hoac bam Mo Game 3Q de thu lai."
    } finally {
        if ($request) { Remove-Job $request -Force -ErrorAction SilentlyContinue }
    }
}
function Test-AppReady {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        $page = Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2
        return ($health.status -eq 'ok' -and $health.service -eq 'Isometric Auto Studio' -and $page.StatusCode -eq 200 -and $page.Content -match 'Auto 3Q Studio')
    } catch { return $false }
}
function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $task = $client.ConnectAsync('127.0.0.1', $Port); if (-not $task.Wait(800)) { return $false }; return $client.Connected } catch { return $false } finally { $client.Dispose() }
}
function Stop-StudioServices {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8000, 5173) })
    $services = @()
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction Stop
        $command = [string]$process.CommandLine
        $main = Join-Path $ProjectDir 'main.py'
        $vite = Join-Path $ProjectDir 'frontend\node_modules\vite\bin\vite.js'
        $isBackend = $listener.LocalPort -eq 8000 -and $process.Name -match '^pythonw?\.exe$' -and $command.IndexOf($main, [StringComparison]::OrdinalIgnoreCase) -ge 0
        $isFrontend = $listener.LocalPort -eq 5173 -and $process.Name -ieq 'node.exe' -and $command.IndexOf($vite, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $command -match '\bpreview\b'
        if (-not ($isBackend -or $isFrontend)) {
            throw "Port $($listener.LocalPort) is occupied by an unrecognized process (PID $($listener.OwningProcess)). No process was stopped."
        }
        $services += $listener.OwningProcess
    }
    # Some Windows hosts report reachable loopback ports but omit their LISTEN rows.
    if (-not $listeners -and ((Test-Port 8000) -or (Test-Port 5173))) {
        $main = Join-Path $ProjectDir 'main.py'
        $vite = Join-Path $ProjectDir 'frontend\node_modules\vite\bin\vite.js'
        $services += @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
            ($_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -and $_.CommandLine.IndexOf($main, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or
            ($_.Name -ieq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($vite, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match '\bpreview\b')
        } | ForEach-Object { $_.ProcessId })
    }
    foreach ($processId in ($services | Select-Object -Unique)) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction Stop
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" -ErrorAction Stop | Where-Object {
            $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -and
            $_.CommandLine.IndexOf((Join-Path $ProjectDir 'main.py'), [StringComparison]::OrdinalIgnoreCase) -ge 0
        })
        foreach ($child in $children) {
            Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $processId -ErrorAction SilentlyContinue
        Add-Content -LiteralPath (Join-Path $logs 'launcher.log') -Value "$(Get-Date -Format s) Stopped studio service PID=$processId"
    }
    $deadline = (Get-Date).AddSeconds(10)
    while ((Test-Port 8000) -or (Test-Port 5173)) {
        if ((Get-Date) -ge $deadline) { throw 'Studio ports did not become available after stopping services.' }
        Start-Sleep -Milliseconds 200
    }
}
function Start-HiddenService([string]$Executable, [string]$Arguments, [string]$Name, [string]$WorkingDirectory) {
    # Redirect to files without a console host or a persistent PowerShell window.
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$Name.stdout.log") -RedirectStandardError (Join-Path $logs "$Name.stderr.log") -PassThru
    Add-Content -LiteralPath (Join-Path $logs 'launcher.log') -Value "$(Get-Date -Format s) Started $Name PID=$($process.Id)"
    return $process
}
try {
    $lockAcquired = $mutex.WaitOne(0)
    if (-not $lockAcquired) { throw 'Another launcher is already running. Please wait and try again.' }
    Start-LauncherProgress
    Set-LauncherProgress 'Dang kiem tra backend va frontend...'
    Set-LauncherProgress 'Dang dung cac dich vu Studio cu...'
    Stop-StudioServices
    $python = Join-Path $ProjectDir '.venv\Scripts\python.exe'
    $frontend = Join-Path $ProjectDir 'frontend'
    $vite = Join-Path $frontend 'node_modules\vite\bin\vite.js'
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) { throw 'Node.js and npm are required. Install Node.js LTS and run again.' }
    $node = $nodeCommand.Source
    $pythonOk = $false
    if (Test-Path $python) {
        try {
            & $python -c 'import fastapi, uvicorn, pydantic, cv2' 2>$null
            $pythonOk = ($LASTEXITCODE -eq 0)
        } catch { $pythonOk = $false }
    }
    if (-not $pythonOk) {
        $py = Get-Command py.exe -ErrorAction SilentlyContinue
        $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
        if ($py) { $basePython = & $py.Source -3 -c 'import sys; sys.exit(1) if sys.version_info < (3, 11) else print(sys.executable)' 2>$null }
        if (-not $basePython -and $systemPython) { $basePython = & $systemPython.Source -c 'import sys; sys.exit(1) if sys.version_info < (3, 11) else print(sys.executable)' 2>$null }
        if (-not $basePython) { throw 'Python >=3.11 is required. Install Python and run again.' }
        Set-LauncherProgress 'Dang sua moi truong Python...'
        Invoke-SetupCommand $basePython @('-m', 'venv', '--upgrade', (Join-Path $ProjectDir '.venv')) $ProjectDir 'Cannot create/repair .venv.'
        Set-LauncherProgress 'Dang cai backend dependencies (co the mat vai phut)...'
        Invoke-SetupCommand $python @('-m', 'pip', 'install', '--force-reinstall', '-r', (Join-Path $ProjectDir 'requirements.txt')) $ProjectDir 'Backend dependency installation failed.'
        & $python -c 'import fastapi, uvicorn, pydantic, cv2'
        if ($LASTEXITCODE -ne 0) { throw 'Backend dependency check failed after installation.' }
    }
    if (-not (Test-Path $vite)) {
        Set-LauncherProgress 'Dang cai frontend dependencies (co the mat vai phut)...'
        Invoke-SetupCommand $npmCommand.Source @('ci') $frontend 'npm ci failed.'
    }
    Set-LauncherProgress 'Dang build frontend...'
    Invoke-SetupCommand $npmCommand.Source @('run', 'build') $frontend 'Frontend build failed.'
    Set-LauncherProgress 'Dang khoi dong backend va frontend...'
    $be = Start-HiddenService $python ('-X utf8 "' + (Join-Path $ProjectDir 'main.py') + '"') 'backend' $ProjectDir
    $fe = Start-HiddenService $node ('"' + $vite + '" preview --host 127.0.0.1 --port 5173 --strictPort') 'frontend' (Join-Path $ProjectDir 'frontend')
    $deadline = (Get-Date).AddSeconds(30)
    do {
        if ($be.HasExited -or $fe.HasExited) { throw 'A service exited. See data\logs stderr logs.' }
        if (Test-AppReady) {
            Set-LauncherProgress 'Dang mo Studio va Game 3Q...'
            Open-Studio
            $gameStatus = Start-Game
            Show-LauncherStatus "$gameStatus`r`nKhoi dong thanh cong.`r`nBackend: OK (8000)`r`nFrontend: OK (5173)`r`n`r`nMo: http://127.0.0.1:5173`r`nDich vu chay an, khong can giu cua so CMD.`r`nLog: $logs"
            exit 0
        }
        Start-Sleep -Milliseconds 500
        if ($progressForm) { [System.Windows.Forms.Application]::DoEvents() }
    } while ((Get-Date) -lt $deadline)
    throw 'Startup timeout. See data\logs. Services left running for diagnosis.'
} catch {
    Show-LauncherStatus "Khoi dong khong thanh cong.`r`n$($_.Exception.Message)`r`n`r`nLog: $logs" $true
    exit 1
} finally {
    Stop-LauncherProgress
    if ($lockAcquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
