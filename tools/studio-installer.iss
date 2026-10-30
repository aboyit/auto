#ifndef StageDir
  #error StageDir must be supplied by the build script
#endif
#ifndef OutputDir
  #error OutputDir must be supplied by the build script
#endif

[Setup]
AppId={{ECA42A14-DFD0-492D-B248-8C2218AE8847}
AppName=Auto 3Q Studio
AppVersion=1.0.0
AppPublisher=Auto 3Q Studio
DefaultDirName={localappdata}\Programs\Auto3QStudio
DefaultGroupName=Auto 3Q Studio
OutputDir={#OutputDir}
OutputBaseFilename=Auto3QStudio-Setup-win-x64
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
UninstallDisplayIcon={app}\studio-backend\studio-backend.exe
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#StageDir}\studio-backend\*"; DestDir: "{app}\studio-backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\platform-tools\*"; DestDir: "{app}\platform-tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\portable-launcher.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\run.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\PORTABLE-README.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\ADB-NOTICE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\seed-data\*"; DestDir: "{app}\data"; Flags: onlyifdoesntexist recursesubdirs createallsubdirs uninsneveruninstall

[Icons]
Name: "{group}\Auto 3Q Studio"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\portable-launcher.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\Auto 3Q Studio"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\portable-launcher.ps1"""; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create desktop shortcut"; GroupDescription: "Shortcuts:"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\portable-launcher.ps1"""; Description: "Open Auto 3Q Studio"; Flags: nowait postinstall skipifsilent
