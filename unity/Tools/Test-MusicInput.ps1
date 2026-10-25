param([string]$FixturePath = '')
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $projectPath 'TestResults\Music'
New-Item -ItemType Directory -Path $output -Force | Out-Null
if (-not $FixturePath) { $FixturePath = Join-Path $projectPath 'TestResults\MusicFixture\original-beat-20s.mp3' }
$FixturePath = (Resolve-Path -LiteralPath $FixturePath).Path
$probePath = Join-Path $output 'input-state.json'
$testId = [Guid]::NewGuid().ToString('N')
$testRoot = Join-Path $output ('Library-' + $testId)
$results = [Collections.Generic.List[string]]::new()
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DashingMusicInput {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd,int command);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint id);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd,StringBuilder name,int size);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint key,uint type);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd,ref Point p);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd,out Rect rect);
    [DllImport("user32.dll")] private static extern uint SendInput(uint count,Input[] input,int size);
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint type; public InputUnion data; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion {
        [FieldOffset(0)] public Keyboard keyboard; [FieldOffset(0)] public Mouse mouse;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Keyboard { public ushort key,scan; public uint flags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] private struct Mouse { public int x,y; public uint data,flags,time; public UIntPtr extra; }
    public static void TypeText(string value) {
        foreach(char c in value) {
            var down = new Input { type=1, data=new InputUnion { keyboard=new Keyboard { scan=c, flags=4 } } };
            var up = down; up.data.keyboard.flags=6;
            if(SendInput(2,new[]{down,up},Marshal.SizeOf(typeof(Input)))!=2) throw new InvalidOperationException("Unicode input failed");
        }
    }
}
'@
function Read-State {
    if (-not (Test-Path -LiteralPath $probePath)) { return $null }
    if ((Get-Item -LiteralPath $probePath).LastWriteTime -lt $script:started) { return $null }
    try { Get-Content -LiteralPath $probePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}
function Await-State([scriptblock]$predicate,[string]$label,[int]$seconds=12) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        $state = Read-State
        if ($null -ne $state -and (& $predicate $state)) { $results.Add('PASS ' + $label); return $state }
        Start-Sleep -Milliseconds 65
    }
    throw ('Music input timed out: ' + $label + '. State: ' + ($state | ConvertTo-Json -Compress))
}
function Assert-Check([bool]$condition,[string]$label) {
    if (-not $condition) { throw ('Music input failed: ' + $label) }
    $results.Add('PASS ' + $label)
}
function Focus-Game {
    $script:gameProcess.Refresh()
    $script:window = $script:gameProcess.MainWindowHandle
    if ($script:window -eq [IntPtr]::Zero) { throw 'Game window missing' }
    [DashingMusicInput]::ShowWindow($script:window,9) | Out-Null
    [DashingMusicInput]::SetForegroundWindow($script:window) | Out-Null
    Start-Sleep -Milliseconds 100
    if ([DashingMusicInput]::GetForegroundWindow() -ne $script:window) { throw 'Game is not foreground; no input sent' }
}
function Send-Key([byte]$key) {
    $scan = [byte][DashingMusicInput]::MapVirtualKey($key,0)
    [DashingMusicInput]::keybd_event($key,$scan,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 70
    [DashingMusicInput]::keybd_event($key,$scan,2,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 90
}
function Tap-Key([byte]$key) { Focus-Game; Send-Key $key }
function Click-Game([int]$x,[int]$y) {
    Focus-Game
    [DashingMusicInput]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
    $rect = [DashingMusicInput+Rect]::new()
    [DashingMusicInput]::GetClientRect($script:window,[ref]$rect) | Out-Null
    $point = [DashingMusicInput+Point]::new()
    $point.X=[int]($x*$rect.Right/1280.0); $point.Y=[int]($y*$rect.Bottom/720.0)
    [DashingMusicInput]::ClientToScreen($script:window,[ref]$point) | Out-Null
    [DashingMusicInput]::SetCursorPos($point.X,$point.Y) | Out-Null
    Start-Sleep -Milliseconds 70
    [DashingMusicInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 70
    [DashingMusicInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 100
}
function Capture-Game([string]$name) {
    Focus-Game
    [DashingMusicInput]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
    $rect = [DashingMusicInput+Rect]::new(); $point = [DashingMusicInput+Point]::new()
    [DashingMusicInput]::GetClientRect($script:window,[ref]$rect) | Out-Null
    [DashingMusicInput]::ClientToScreen($script:window,[ref]$point) | Out-Null
    $bitmap = [Drawing.Bitmap]::new($rect.Right,$rect.Bottom); $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try { $graphics.CopyFromScreen($point.X,$point.Y,0,0,$bitmap.Size); $bitmap.Save((Join-Path $output $name),[Drawing.Imaging.ImageFormat]::Png) }
    finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Start-Game {
    $script:started = Get-Date
    $arguments = '--dashing-music-input-check --music-test-id ' + $testId + ' -screen-width 1280 -screen-height 720 -screen-fullscreen 0 -logFile "' + (Join-Path $output 'music-input.log') + '"'
    $script:gameProcess = Start-Process -FilePath (Join-Path $projectPath 'Builds\Windows\Dashing.exe') -ArgumentList $arguments -WindowStyle Normal -PassThru
    $null = Await-State {param($s) -not $s.active} 'Native menu ready' 60
    Focus-Game
    Start-Sleep -Milliseconds 600
}
function Stop-Game {
    if ($null -eq $script:gameProcess) { return }
    $script:gameProcess.Refresh()
    if (-not $script:gameProcess.HasExited) {
        $script:gameProcess.CloseMainWindow() | Out-Null
        if (-not $script:gameProcess.WaitForExit(5000)) { Stop-Process -Id $script:gameProcess.Id }
    }
}
try {
    Start-Game
    Capture-Game 'ui-00-menu.png'
    Click-Game 500 599
    $null = Await-State {param($s) $s.active -and $s.screen -eq 'Library'} 'Main menu opens music library'
    Capture-Game 'ui-01-library.png'
    Click-Game 1030 167
    Start-Sleep -Milliseconds 500
    $dialog = [DashingMusicInput]::GetForegroundWindow(); $ownerId = [uint32]0
    [DashingMusicInput]::GetWindowThreadProcessId($dialog,[ref]$ownerId) | Out-Null
    $class = [Text.StringBuilder]::new(128); [DashingMusicInput]::GetClassName($dialog,$class,128) | Out-Null
    Assert-Check ($ownerId -eq $script:gameProcess.Id -and $class.ToString() -eq '#32770') 'Windows MP3 file dialog opens'
    [DashingMusicInput]::keybd_event(18,0,0,[UIntPtr]::Zero); Send-Key 78; [DashingMusicInput]::keybd_event(18,0,2,[UIntPtr]::Zero)
    [DashingMusicInput]::keybd_event(17,0,0,[UIntPtr]::Zero); Send-Key 65; [DashingMusicInput]::keybd_event(17,0,2,[UIntPtr]::Zero)
    [DashingMusicInput]::TypeText($FixturePath); Send-Key 13
    $null = Await-State {param($s) $s.screen -eq 'Ready'} 'Native picker imports real MP3' 65
    Capture-Game 'ui-02-ready.png'
    Click-Game 845 415
    $null = Await-State {param($s) $s.screen -eq 'Recording' -and $s.time -lt 0} 'Empty rerecord starts countdown without discard modal'
    $null = Await-State {param($s) $s.time -gt .1} 'Music starts after countdown'
    Tap-Key 87
    $first = Await-State {param($s) $s.notes -eq 1 -and $s.monsters -eq 1} 'Keyboard W records upper rail and spawns monster'
    Assert-Check (-not $first.characterVisible -and $first.firstMonsterX -le $first.recordX) 'Recording hides character; monster starts at central record point'
    Start-Sleep -Milliseconds 200
    $moved=Read-State
    Assert-Check ($moved.firstMonsterX -lt $first.firstMonsterX) 'Recorded monster moves left after input'
    Click-Game 640 515
    $null = Await-State {param($s) $s.notes -eq 2} 'Mouse lower rail records on press'
    Tap-Key 80
    $paused = Await-State {param($s) $s.paused} 'P pauses recording'
    Tap-Key 83
    Start-Sleep -Milliseconds 250
    $frozen = Read-State
    Assert-Check ($frozen.notes -eq 2 -and [Math]::Abs($frozen.time-$paused.time) -lt .001) 'Paused taps ignored and song clock frozen'
    Capture-Game 'ui-03-recording-paused.png'
    Click-Game 520 678
    $null = Await-State {param($s) -not $s.paused} 'Pause button resumes music'
    Click-Game 640 250
    $null = Await-State {param($s) $s.notes -eq 3} 'Mouse upper rail records'
    Click-Game 760 678
    $null = Await-State {param($s) $s.screen -eq 'Review' -and $s.notes -eq 3} 'End recording opens draft review'
    Click-Game 435 415
    $null = Await-State {param($s) $s.notes -eq 2} 'Undo button removes last tap'
    Click-Game 640 689
    $null = Await-State {param($s) $s.confirm -and $s.dirty} 'Unsaved draft protected on return'
    Click-Game 845 345
    $null = Await-State {param($s) $s.confirm -and $s.screen -eq 'Review'} 'Modal blocks underlying replay button'
    Capture-Game 'ui-04-discard.png'
    Tap-Key 27
    $null = Await-State {param($s) -not $s.confirm -and $s.notes -eq 2} 'Esc cancels discard and preserves notes'
    Click-Game 845 415
    $null = Await-State {param($s) $s.confirm -and $s.notes -eq 2} 'Rerecord asks before clearing recorded notes'
    Click-Game 450 400
    $null = Await-State {param($s) -not $s.confirm -and $s.notes -eq 2} 'Keep button preserves draft'
    Click-Game 845 415
    Click-Game 830 400
    $null = Await-State {param($s) $s.screen -eq 'Recording' -and $s.notes -eq 0 -and -not $s.dirty} 'Confirm rerecord clears notes and restarts'
    $null = Await-State {param($s) $s.time -gt .1} 'Rerecord music starts'
    Tap-Key 87
    Click-Game 640 515
    Click-Game 760 678
    $null = Await-State {param($s) $s.screen -eq 'Review' -and $s.notes -eq 2} 'New recording replaces previous draft'
    Click-Game 640 173
    [DashingMusicInput]::keybd_event(17,0,0,[UIntPtr]::Zero); Send-Key 65; [DashingMusicInput]::keybd_event(17,0,2,[UIntPtr]::Zero)
    [DashingMusicInput]::TypeText('UI music chart')
    Click-Game 640 110
    Click-Game 845 345
    $null = Await-State {param($s) $s.screen -eq 'CharacterSelect' -and $s.dirty} 'Draft audition opens character selection'
    Capture-Game 'ui-08-character-select.png'
    Click-Game 435 265
    $null = Await-State {param($s) $s.character -eq 'Rin' -and $s.hp -eq 125 -and $s.maxHp -eq 250} 'Rin selection uses survival health'
    Click-Game 845 265
    $null = Await-State {param($s) $s.character -eq 'Zhe' -and $s.hp -eq 300 -and $s.maxHp -eq 300} 'Zhe selection uses survival health'
    Click-Game 640 575
    $null = Await-State {param($s) $s.screen -eq 'Playing' -and $s.dirty -and $s.characterVisible -and $s.character -eq 'Zhe'} 'Selected character appears for draft audition'
    Click-Game 760 678
    $null = Await-State {param($s) $s.screen -eq 'Review' -and $s.dirty -and $s.notes -eq 2} 'Ending audition retains editable draft'
    Click-Game 640 485
    $saved = Await-State {param($s) $s.screen -eq 'Library' -and $s.levels -eq 1 -and -not $s.dirty} 'Save button adds local playable level'
    Assert-Check ([IO.Path]::GetFullPath($saved.root) -eq [IO.Path]::GetFullPath($testRoot)) 'Test library isolated from player levels'
    $chartPath = @(Get-ChildItem -LiteralPath $testRoot -Filter chart.json -Recurse)[0].FullName
    $chart = Get-Content -LiteralPath $chartPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Check ($chart.notes.Count -eq 2 -and $chart.notes[0].rail -eq 0 -and $chart.notes[1].rail -eq 1) 'Persisted chart matches keyboard and mouse rails'
    Assert-Check ($chart.title -eq 'UI music chart') 'Edited title persists in saved chart'
    Assert-Check (Test-Path -LiteralPath (Join-Path (Split-Path $chartPath) 'music.mp3')) 'Saved level includes MP3 copy'
    Capture-Game 'ui-05-saved.png'
    Stop-Game
    Start-Game
    Click-Game 500 599
    $null = Await-State {param($s) $s.active -and $s.levels -eq 1} 'Saved level survives process restart'
    Click-Game 640 294
    $null = Await-State {param($s) $s.screen -eq 'CharacterSelect'} 'Saved library row opens character selection' 65
    Click-Game 845 265
    Click-Game 640 575
    $null = Await-State {param($s) $s.screen -eq 'Playing' -and $s.character -eq 'Zhe'} 'Chosen character starts saved chart'
    $null = Await-State {param($s) $s.time -gt 0 -and -not $s.paused} 'Saved music begins playing'
    Capture-Game 'ui-06-playing.png'
    $null = Await-State {param($s) $s.screen -eq 'Results' -and $s.miss -eq 2 -and $s.hp -eq 280} 'Song results apply survival same-rail damage and opposite-rail graze' 35
    Capture-Game 'ui-07-results.png'
    Click-Game 640 689
    $null = Await-State {param($s) $s.screen -eq 'Library'} 'Results return to library'
    Click-Game 640 689
    $null = Await-State {param($s) -not $s.active} 'Music mode returns to original menu'
    $results.Add('DASHING_MUSIC_INPUT_PASS')
    $results | Set-Content -LiteralPath (Join-Path $output 'music-input-checks.txt') -Encoding UTF8
    $results
} finally {
    Stop-Game
    $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
    if ((Split-Path $resolvedRoot) -eq [IO.Path]::GetFullPath($output) -and (Split-Path $resolvedRoot -Leaf) -eq ('Library-' + $testId) -and (Test-Path -LiteralPath $resolvedRoot)) {
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
    }
}
