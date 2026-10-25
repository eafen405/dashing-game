$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$exePath = Join-Path $projectPath 'Builds\Windows\Dashing.exe'
$probePath = Join-Path $projectPath 'TestResults\input-probe.json'
$logPath = Join-Path $projectPath 'input-check.log'
$results = [Collections.Generic.List[string]]::new()
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DashingInputCheck {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd,int nCmdShow);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint key,uint type);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd,ref Point p);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd,out Rect rect);
    [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
    [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
}
'@
$startTime = Get-Date
$argumentText = '--dashing-input-check -screen-width 1280 -screen-height 720 -screen-fullscreen 0 -logFile "' + $logPath + '"'
$gameProcess = Start-Process -FilePath $exePath -ArgumentList $argumentText -WindowStyle Normal -PassThru
function Read-State {
    if (-not (Test-Path -LiteralPath $probePath)) { return $null }
    if ((Get-Item -LiteralPath $probePath).LastWriteTime -lt $startTime) { return $null }
    try { return (Get-Content -LiteralPath $probePath -Raw | ConvertFrom-Json) } catch { return $null }
}
function Await-State([scriptblock]$predicate,[string]$label,[int]$seconds=10) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        $state = Read-State
        if ($null -ne $state -and (& $predicate $state)) { $results.Add('PASS ' + $label); return $state }
        Start-Sleep -Milliseconds 80
    }
    throw ('Input check timed out: ' + $label + '. Last state: ' + ($state | ConvertTo-Json -Compress))
}
function Focus-Game {
    $gameProcess.Refresh()
    $script:windowHandle = $gameProcess.MainWindowHandle
    if ($script:windowHandle -eq [IntPtr]::Zero) { throw 'Game window handle is missing.' }
    [DashingInputCheck]::ShowWindow($script:windowHandle,9) | Out-Null
    [DashingInputCheck]::SetForegroundWindow($script:windowHandle) | Out-Null
    Start-Sleep -Milliseconds 120
    if ([DashingInputCheck]::GetForegroundWindow() -ne $script:windowHandle) {
        throw 'Game window is not foreground. No input was sent.'
    }
}
function Tap-Key([byte]$key) {
    Focus-Game
    $scan = [byte][DashingInputCheck]::MapVirtualKey($key,0)
    [DashingInputCheck]::keybd_event($key,$scan,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 90
    [DashingInputCheck]::keybd_event($key,$scan,2,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 100
}
function Click-Game([int]$x,[int]$y) {
    Focus-Game
    [DashingInputCheck]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
    $rect = [DashingInputCheck+Rect]::new()
    [DashingInputCheck]::GetClientRect($script:windowHandle,[ref]$rect) | Out-Null
    $point = [DashingInputCheck+Point]::new()
    $point.X=[int]($x*($rect.Right-$rect.Left)/1280.0)
    $point.Y=[int]($y*($rect.Bottom-$rect.Top)/720.0)
    [DashingInputCheck]::ClientToScreen($script:windowHandle,[ref]$point) | Out-Null
    [DashingInputCheck]::SetCursorPos($point.X,$point.Y) | Out-Null
    Start-Sleep -Milliseconds 120
    [DashingInputCheck]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 80
    [DashingInputCheck]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 120
    if ([DashingInputCheck]::GetForegroundWindow() -ne $script:windowHandle) {
        throw ('Click left the game window. Client bounds: ' + ($rect | ConvertTo-Json -Compress))
    }
}
function Capture-Game([string]$name) {
    Focus-Game
    [DashingInputCheck]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
    $rect = [DashingInputCheck+Rect]::new()
    [DashingInputCheck]::GetClientRect($script:windowHandle,[ref]$rect) | Out-Null
    $point = [DashingInputCheck+Point]::new()
    [DashingInputCheck]::ClientToScreen($script:windowHandle,[ref]$point) | Out-Null
    $bitmap = [Drawing.Bitmap]::new($rect.Right,$rect.Bottom)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($point.X,$point.Y,0,0,$bitmap.Size)
        $folder = Join-Path $projectPath 'TestResults\KeyBindings'
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        $bitmap.Save((Join-Path $folder $name),[Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    $initial = Await-State {param($s) $s.phase -eq 'Menu'} 'Native menu ready' 60
    Tap-Key 119
    $null = Await-State {param($s) $s.rinRefined -ne $initial.rinRefined} 'F8 toggles Rin rendering quality'
    Tap-Key 119
    $null = Await-State {param($s) $s.rinRefined -eq $initial.rinRefined} 'F8 restores Rin rendering quality'
    Click-Game 785 425
    $null = Await-State {param($s) $s.keyEditor} 'Open editable keyboard settings'
    Capture-Game '01-editor.png'
    Click-Game 535 293
    $null = Await-State {param($s) $s.listening} 'Select first top-rail slot'
    Tap-Key 86
    $null = Await-State {param($s) -not $s.listening -and $s.bindings.top[0] -eq 118} 'V replaces top-rail key'
    Click-Game 535 293
    Tap-Key 80
    $null = Await-State {param($s) $s.listening -and $s.keyError -and $s.phase -eq 'Menu'} 'Reserved pause key rejected without pausing'
    Tap-Key 13
    $null = Await-State {param($s) $s.listening -and $s.keyError -and $s.phase -eq 'Menu'} 'Reserved Enter rejected without starting'
    Tap-Key 27
    $null = Await-State {param($s) $s.keyEditor -and -not $s.listening} 'Escape cancels capture and keeps settings open'
    Click-Game 535 403
    Tap-Key 86
    $null = Await-State {param($s) $s.listening -and $s.keyError} 'Cross-rail duplicate rejected'
    Capture-Game '02-conflict.png'
    Tap-Key 66
    $null = Await-State {param($s) -not $s.listening -and $s.bindings.bottom[0] -eq 98} 'B replaces bottom-rail key'
    Click-Game 825 293
    Tap-Key 67
    $null = Await-State {param($s) $s.bindings.top.Count -eq 3 -and $s.bindings.top[2] -eq 99} 'Add a third top-rail key'
    Capture-Game '03-custom.png'
    Click-Game 680 334
    $null = Await-State {param($s) $s.bindings.top.Count -eq 2} 'Remove an extra key'
    Click-Game 680 334
    $null = Await-State {param($s) $s.bindings.top.Count -eq 1} 'Remove down to one key'
    Click-Game 535 334
    $null = Await-State {param($s) $s.bindings.top.Count -eq 1} 'Last key cannot be removed'
    Tap-Key 27
    $null = Await-State {param($s) -not $s.keyEditor -and $s.phase -eq 'Menu'} 'Escape returns to menu without starting'
    Tap-Key 13
    Tap-Key 86
    $null = Await-State {param($s) $s.phase -eq 'Running' -and $s.lane -eq 'Top'} 'Edited V key hits top rail'
    Tap-Key 66
    $null = Await-State {param($s) $s.phase -eq 'Running' -and $s.lane -eq 'Bottom'} 'Edited B key hits bottom rail'
    Tap-Key 80
    Click-Game 785 425
    $null = Await-State {param($s) $s.keyEditor -and $s.phase -eq 'Paused'} 'Open keyboard editor while paused'
    Capture-Game '04-paused.png'
    Click-Game 495 607
    $null = Await-State {param($s) $s.bindings.top[0] -eq 119 -and $s.bindings.bottom[0] -eq 115} 'Restore defaults from keyboard editor'
    Click-Game 785 607
    $null = Await-State {param($s) -not $s.keyEditor -and $s.phase -eq 'Paused'} 'Back button preserves paused state'
    Click-Game 640 599
    $null = Await-State {param($s) $s.phase -eq 'Menu'} 'Return to menu after editing'
    Tap-Key 13
    $null = Await-State {param($s) $s.phase -eq 'Running'} 'Enter starts game'
    Tap-Key 87
    $null = Await-State {param($s) $s.phase -eq 'Running' -and $s.lane -eq 'Top'} 'W hits top rail'
    Tap-Key 83
    $null = Await-State {param($s) $s.phase -eq 'Running' -and $s.lane -eq 'Bottom'} 'S hits bottom rail'
    Tap-Key 80
    $paused = Await-State {param($s) $s.phase -eq 'Paused'} 'P pauses'
    Start-Sleep -Milliseconds 400
    $frozen = Read-State
    if ($frozen.now -ne $paused.now) { throw 'Paused game clock advanced.' }
    $results.Add('PASS Paused game clock stays frozen')
    Tap-Key 80
    $null = Await-State {param($s) $s.phase -eq 'Running'} 'P resumes'
    Click-Game 1243 32
    $null = Await-State {param($s) $s.phase -eq 'Paused'} 'Native pause button'
    Click-Game 640 529
    $null = Await-State {param($s) $s.phase -eq 'Running'} 'Native continue button'
    Click-Game 600 200
    $null = Await-State {param($s) $s.phase -eq 'Running' -and $s.lane -eq 'Top'} 'Mouse upper half hits top'
    Click-Game 600 530
    $null = Await-State {param($s) $s.phase -eq 'Running' -and $s.lane -eq 'Bottom'} 'Mouse lower half hits bottom'
    Tap-Key 27
    $null = Await-State {param($s) $s.phase -eq 'Paused'} 'Esc pauses'
    Click-Game 640 599
    $menu = Await-State {param($s) $s.phase -eq 'Menu'} 'Return to menu button'
    Click-Game 495 318
    $null = Await-State {param($s) $s.character -ne $menu.character} 'Character selection button'
    Click-Game 785 318
    $null = Await-State {param($s) $s.difficulty -ne $menu.difficulty} 'Difficulty selection button'
    Click-Game 640 529
    $null = Await-State {param($s) $s.phase -eq 'Running'} 'Native start button'
    $results.Add('DASHING_INPUT_CHECKS_PASS')
    $results | Set-Content -LiteralPath (Join-Path $projectPath 'TestResults\input-checks.txt') -Encoding UTF8
    $results
} finally {
    $gameProcess.Refresh()
    if (-not $gameProcess.HasExited) { $gameProcess.CloseMainWindow() | Out-Null }
}
