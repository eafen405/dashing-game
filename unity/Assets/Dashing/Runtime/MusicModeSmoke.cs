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
            while (music.SongTime < 1.1) yield return null; music.Press(Lane.Top, "smoke-hold");
            yield return new WaitForSecondsRealtime(.2f); music.TogglePause(); before = music.SongTime;
            double heldBefore = music.Recorder.PreviewDuration(music.Recorder.Notes[2], before);
            yield return new WaitForSecondsRealtime(.25f);
            Check(Math.Abs(music.Recorder.PreviewDuration(music.Recorder.Notes[2], music.SongTime) - heldBefore) < .001, "Recording hold excludes paused time"); music.TogglePause();
            while (music.SongTime < 1.45) yield return null; music.Tap(Lane.Bottom);
            while (music.SongTime < 1.8) yield return null; music.Release("smoke-hold");
            Check(music.Recorder.Notes[2].kind == MonsterKind.Hold && music.Recorder.Notes[2].duration > .6 && music.Recorder.Notes[2].duration < .85, "Native recording captures actual hold duration");
            while (music.SongTime < 2.2) yield return null; music.ToggleRecordTwins(); music.Tap(Lane.Bottom); music.ToggleRecordTwins();
            Check(music.Recorder.Notes.Count == 6 && music.Recorder.Notes[4].kind == MonsterKind.Twin && music.Recorder.Notes[4].pairId == music.Recorder.Notes[5].pairId, "Native twin toggle records a linked pair from either rail");
            music.StopRun(); Check(music.Screen == MusicScreen.Review && music.Chart.notes.Count == 6 && music.Dirty, "Stop produces mixed-monster review draft");
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
                var heldNote = music.Session.Chart.notes[2];
                while (music.SongTime < heldNote.time) yield return null; music.Press(Lane.Top, "smoke-hold");
                Check(music.View.HoldId != 0 && Math.Abs(music.Battle.Combat.Find(music.View.HoldId).HoldDuration - heldNote.duration) < 1e-9, "Reloaded hold uses saved duration");
                music.TogglePause(); before = music.SongTime; double progress = music.Battle.MonsterAt(2).HoldT; yield return new WaitForSecondsRealtime(.2f);
                Check(music.SongTime == before && music.Battle.MonsterAt(2).HoldT == progress && music.View.HoldId != 0, "Playback pause freezes active hold"); music.TogglePause();
                while (music.SongTime < music.Session.Chart.notes[3].time) yield return null; music.Tap(Lane.Bottom);
                Check(music.View.HoldId != 0 && music.View.PlayerLane == Lane.Top, "Chart hold keeps body anchored during opposite-rail strike");
                yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(Path.Combine(output, "music-hold.png"));
                while (music.Session.Judgments[2] == RhythmJudgment.Pending) yield return null;
                music.Release("smoke-hold"); Check(music.Session.Perfect == 4 && music.View.Score == 1500, "Hold and soul note settle with shared rewards");
                while (music.SongTime < music.Session.Chart.notes[4].time - .1) yield return null;
                yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(Path.Combine(output, "music-twins.png"));
                while (music.SongTime < music.Session.Chart.notes[4].time) yield return null; music.Tap(Lane.Top); yield return null; music.Tap(Lane.Bottom);
                Check(music.Session.Perfect == 6 && music.View.Score == 2500 && music.View.Hp == 165, "Reloaded twins settle both rails with pair reward");
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
