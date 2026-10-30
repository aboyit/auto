param([string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
if (-not (Test-Path $python)) { throw 'Create .venv and install requirements.txt before packaging.' }
if (-not (Test-Path (Join-Path $root 'platform-tools\adb.exe'))) { throw 'platform-tools\adb.exe is required.' }
& $python -c 'import PyInstaller, fastapi, cv2, uvicorn'
if ($LASTEXITCODE -ne 0) { throw 'Install PyInstaller in the build venv: .venv\Scripts\python.exe -m pip install pyinstaller' }
Push-Location (Join-Path $root 'frontend')
try {
    if (-not (Test-Path 'node_modules\vite\bin\vite.js')) { & $npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' } }
    & $npm run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
finally { Pop-Location }
$staging = Join-Path $OutputDir ("build-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
& $python -m PyInstaller --noconfirm --clean --onedir --name studio-backend --distpath $staging --workpath (Join-Path $OutputDir 'pyinstaller-work') --specpath $OutputDir --paths (Join-Path $root 'backend') (Join-Path $root 'main.py')
if ($LASTEXITCODE -ne 0) { throw 'Backend packaging failed.' }
New-Item -ItemType Directory -Path (Join-Path $staging 'frontend\dist') -Force | Out-Null
Copy-Item (Join-Path $root 'frontend\dist\*') (Join-Path $staging 'frontend\dist') -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $staging 'platform-tools') -Force | Out-Null
Copy-Item (Join-Path $root 'platform-tools\adb.exe') (Join-Path $staging 'platform-tools')
Copy-Item (Join-Path $root 'platform-tools\AdbWinApi.dll') (Join-Path $staging 'platform-tools')
Copy-Item (Join-Path $root 'platform-tools\AdbWinUsbApi.dll') (Join-Path $staging 'platform-tools')
Copy-Item (Join-Path $root 'tools\portable-launcher.ps1') (Join-Path $staging 'portable-launcher.ps1') -Force
Copy-Item (Join-Path $root 'tools\portable-run.bat') (Join-Path $staging 'run.bat') -Force
Copy-Item (Join-Path $root 'tools\PORTABLE-README.txt') (Join-Path $staging 'PORTABLE-README.txt') -Force
Copy-Item (Join-Path $root 'platform-tools\NOTICE.txt') (Join-Path $staging 'ADB-NOTICE.txt') -Force
# The installer seeds a new installation with current local data; existing installed files are never overwritten.
$sourceData = Join-Path $root 'data'
$seedData = Join-Path $staging 'seed-data'
New-Item -ItemType Directory -Path $seedData -Force | Out-Null
foreach ($name in @('auto_config.json', 'scenarios.json')) {
    $source = Join-Path $sourceData $name
    if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $seedData }
}
$templates = Join-Path $sourceData 'templates'
if (Test-Path $templates) { Copy-Item -LiteralPath $templates -Destination $seedData -Recurse }
Write-Warning 'Installer includes your local scenarios, config and template images. Do not share this installer with others.'
$compilerCandidates = @((Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue))
if ($env:LOCALAPPDATA) { $compilerCandidates += (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe') }
if (${env:ProgramFiles(x86)}) { $compilerCandidates += (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 7\ISCC.exe'); $compilerCandidates += (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe') }
if ($env:ProgramFiles) { $compilerCandidates += (Join-Path $env:ProgramFiles 'Inno Setup 7\ISCC.exe') }
$compiler = $compilerCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $compiler) { throw 'Install Inno Setup 7 (winget install --id JRSoftware.InnoSetup.7 -e -s winget), then rebuild.' }
& $compiler "/DStageDir=$staging" "/DOutputDir=$OutputDir" (Join-Path $root 'tools\studio-installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
Write-Host "Installer ready: $(Join-Path $OutputDir 'Auto3QStudio-Setup-win-x64.exe')"
Write-Host 'Installed updates replace program files but retain data/config. BlueStacks and ADB enabled are needed to control a game.'
