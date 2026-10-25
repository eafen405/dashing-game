using System;
using System.Collections;
using System.IO;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    // Opt-in native integration check: isolated library and no player preference writes.
    public static class MusicModeSmoke
    {
        private static string report;
        private static int checks;
        private static void Check(bool condition, string name)
        {
            if (!condition) { File.WriteAllText(report, "{\"passed\":false,\"failure\":\"" + name + "\"}"); Application.Quit(1); throw new Exception("MUSIC_SMOKE_FAILED: " + name); }
            checks++; Debug.Log("MUSIC_SMOKE_PASS " + name);
        }
        public static IEnumerator Run(MusicMode music)
        {
            string output = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../TestResults/Music")); Directory.CreateDirectory(output); report = Path.Combine(output, "music-smoke.json");
            string[] args = Environment.GetCommandLineArgs(); int index = Array.IndexOf(args, "--music-fixture");
            Check(index >= 0 && index + 1 < args.Length, "MP3 fixture argument");
            string source = args[index + 1]; music.Open(); music.Import(Path.Combine(output, "missing.mp3"));
            Check(music.Screen == MusicScreen.Library && music.Status.Contains("失败"), "Missing import handled");
            music.Import(source); float deadline = Time.realtimeSinceStartup + 65;
            while (music.Screen == MusicScreen.Loading && Time.realtimeSinceStartup < deadline) yield return null;
            Check(music.Screen == MusicScreen.Ready && music.Duration > 2, "Real MP3 decoded in native player");
            music.StartRecording(); music.Tap(Lane.Top); Check(music.Recorder.Notes.Count == 0, "Countdown ignores tap");
            music.TogglePause(); double before = music.SongTime; yield return new WaitForSecondsRealtime(.25f);
            Check(music.Paused && Math.Abs(music.SongTime - before) < .001, "Countdown pause freezes DSP chart time"); music.TogglePause();
            while (music.SongTime < .3) yield return null; music.Tap(Lane.Top);
            Check(music.View.Monsters.Count==1&&Math.Abs(music.View.Monsters[0].X-music.View.Layout.Width/2)<1,"Recording tap spawns at central point");
            yield return null;Check(!music.Host.MusicCharacterVisible,"Recording hides character and character effects");
            yield return new WaitForSecondsRealtime(.1f);Check(music.View.Monsters[0].X<music.View.Layout.Width/2,"Recorded monster moves to the left");
            while (music.SongTime < .6) yield return null; music.Tap(Lane.Bottom);
            Check(music.Recorder.Notes.Count == 2, "Record both rails");
            music.TogglePause(); before = music.SongTime; yield return new WaitForSecondsRealtime(.25f);
            music.Tap(Lane.Top); Check(music.Recorder.Notes.Count == 2 && Math.Abs(music.SongTime - before) < .001, "Pause neither records nor drifts"); music.TogglePause();
            while (music.SongTime < .9) yield return null; music.Tap(Lane.Top); music.Undo(); Check(music.Recorder.Notes.Count == 2, "Undo removes latest tap");
            music.StopRun(); Check(music.Screen == MusicScreen.Review && music.Chart.notes.Count == 2 && music.Dirty, "Stop produces review draft");
            music.BackToLibrary(); Check(music.ConfirmDiscard && music.Dirty, "Unsaved chart protected"); music.CancelDiscard();
            music.UI.TitleText = "MP3 双轨烟测"; music.Save();
            Check(music.Screen == MusicScreen.Library && !music.Dirty && music.Levels.Count == 1, "Save makes playable library level");
            string copied = music.Levels[0].AudioPath; Check(File.Exists(copied) && Path.GetFullPath(copied) != Path.GetFullPath(source), "Music copied into level");
            string originalMoved = source + ".temporarily-moved"; File.Move(source, originalMoved);
            try
            {
                music.Close(); music.Open(); Check(music.Levels.Count == 1, "Library reload survives missing original MP3");
                music.PlayLevel(0); deadline = Time.realtimeSinceStartup + 65;
                while (music.Screen == MusicScreen.Loading && Time.realtimeSinceStartup < deadline) yield return null;
                Check(music.Screen == MusicScreen.CharacterSelect, "Saved chart opens character selection");
                music.SelectCharacter(Character.Zhe);Check(music.View.Hp==300&&music.View.MaxHp==300,"Character selection previews Zhe health");
                music.SelectCharacter(Character.Rin);music.BeginPlay();
                Check(music.Screen==MusicScreen.Playing&&music.View.Hp==125&&music.View.MaxHp==250,"Chosen Rin starts with survival health");
                while (music.SongTime < music.Session.Chart.notes[0].time) yield return null; music.Tap(Lane.Top);
                while (music.SongTime < music.Session.Chart.notes[1].time) yield return null; music.Tap(Lane.Bottom);
                Check(music.Session.Perfect == 2 && music.View.Score == 600&&music.View.Hp==135, "Recorded hits use shared critical score and Rin healing");
                deadline = Time.realtimeSinceStartup + 40;
                while (music.Screen == MusicScreen.Playing && Time.realtimeSinceStartup < deadline) yield return null;
                Check(music.Screen == MusicScreen.Results && music.Session.Miss == 0, "Song ends with complete results");
                yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(Path.Combine(output, "music-results.png")); yield return new WaitForSecondsRealtime(.3f);
                music.BackToLibrary(); Check(music.Screen == MusicScreen.Library, "Results return to library");
                yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(Path.Combine(output, "music-library.png")); yield return new WaitForSecondsRealtime(.3f);
            }
            finally { if (File.Exists(originalMoved) && !File.Exists(source)) File.Move(originalMoved, source); }
            music.Close(); if (Directory.Exists(music.Store.Root)) Directory.Delete(music.Store.Root, true);
            File.WriteAllText(report, "{\"passed\":true,\"checks\":" + checks + "}"); Debug.Log("DASHING_MUSIC_SMOKE_PASS"); Application.Quit();
        }
    }
}
