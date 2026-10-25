using System;
using System.IO;
using System.Text;
using UnityEngine;
using Dashing.Core;
using Dashing.Unity;

namespace Dashing.Editor
{
    public static class MusicChecks
    {
        public static string Run()
        {
            int count = 0; var log = new StringBuilder();
            Action<bool, string> check = (ok, name) => { if (!ok) throw new Exception("MUSIC_CHECK_FAILED: " + name); count++; log.AppendLine("PASS " + name); };
            Action<Action, string> rejects = (action, name) => { bool rejected = false; try { action(); } catch (ArgumentException) { rejected = true; } catch (IOException) { rejected = true; } check(rejected, name); };
            var recorder = new ChartRecorder();
            check(!recorder.Record(-.1, Lane.Top, 10), "Ignore countdown inputs");
            check(!recorder.Record(double.NaN, Lane.Top, 10), "Reject invalid input clock");
            check(recorder.Record(0, Lane.Top, 10), "Record song start");
            check(!recorder.Record(.01, Lane.Top, 10), "Debounce same rail");
            check(recorder.Record(0, Lane.Bottom, 10), "Allow simultaneous rails");
            check(recorder.Record(.025, Lane.Top, 10), "Allow exact debounce boundary");
            check(!recorder.Record(10, Lane.Bottom, 10), "Ignore inputs at song end");
            check(!recorder.Record(.01, Lane.Bottom, 10), "Reject recording clock reversal");
            check(recorder.Undo() && recorder.Notes.Count == 2, "Undo most recent tap");
            recorder.Undo(); recorder.Undo(); check(!recorder.Undo(), "Empty undo is safe");
            var clock = new SongTimeline(); clock.Start(100, 2);
            check(Math.Abs(clock.Time(101) + 1) < 1e-9, "DSP countdown");
            clock.Pause(101); check(clock.Time(500) == -1, "Countdown freezes");
            clock.Resume(500); check(clock.Time(501) == 0, "Countdown resumes at correct start");
            clock.Pause(502.25); clock.Pause(700); check(clock.Time(900) == 1.25, "Repeated pause does not move clock");
            clock.Resume(900); clock.Resume(901); check(clock.Time(901) == 2.25, "Repeated resume is idempotent");
            var chart = Sample(); chart.Validate();
            var copy = chart.Copy(); copy.notes[0].time = 7; check(chart.notes[0].time == 1, "Chart copies own note data");
            foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, -1, 0, 1801 })
            { var bad = Sample(); bad.duration = invalid; rejects(() => bad.Validate(), "Reject duration " + invalid); }
            var invalidVersion = Sample(); invalidVersion.version = 2; rejects(() => invalidVersion.Validate(), "Reject unknown chart version");
            var traversal = Sample(); traversal.audioFile = "../music.mp3"; rejects(() => traversal.Validate(), "Reject audio path traversal");
            var invalidRail = Sample(); invalidRail.notes[0].rail = (Lane)4; rejects(() => invalidRail.Validate(), "Reject invalid rail");
            var unsorted = Sample(); unsorted.notes.Reverse(); rejects(() => unsorted.Validate(), "Reject unsorted chart");
            var atEnd = Sample(); atEnd.notes[2].time = 10; rejects(() => atEnd.Validate(), "Reject note outside audio");
            var duplicate = Sample(); duplicate.notes.Insert(1, new RhythmNote(1, Lane.Top)); rejects(() => duplicate.Validate(), "Reject duplicate same-rail note");
            var empty = Sample(); empty.notes.Clear(); rejects(() => empty.Validate(), "Do not save empty charts");
            var invalidTitle = Sample(); invalidTitle.title = " "; rejects(() => invalidTitle.Validate(), "Require readable title");
            var nullNote = Sample(); nullNote.notes[0] = null; rejects(() => nullNote.Validate(), "Reject null note");
            var session = new RhythmSession(Sample());
            session.Advance(.8); check(session.Press(Lane.Top, .8).index == -1, "Ignore early stray input");
            check(session.Press(Lane.Bottom, 1).index == 1, "Simultaneous bottom note has own judgment");
            check(session.Press(Lane.Top, 1.06).judgment == RhythmJudgment.Perfect, "Perfect window inclusive");
            check(session.Press(Lane.Top, 1.06).index == -1, "Cannot score one note twice");
            check(session.Press(Lane.Top, 2.15).judgment == RhythmJudgment.Good, "Good window inclusive");
            check(session.Perfect == 2 && session.Good == 1 && session.Score == 2500 && session.MaxCombo == 3, "Correct score and combo");
            check(Math.Abs(session.Accuracy - 2.5 / 3) < 1e-9, "Accuracy includes full chart denominator");
            check(!session.Finished(10) && session.Finished(10.16), "Results wait for final judgment window");
            var missed = new RhythmSession(Sample()); missed.Advance(1.15); check(missed.Miss == 0, "Do not expire inclusive late window");
            missed.Advance(1.151); check(missed.Miss == 2 && missed.Expired.Count == 2, "Expire simultaneous misses once");
            missed.Advance(1.2); check(missed.Miss == 2 && missed.Expired.Count == 0, "No repeat miss");
            missed.Press(Lane.Top, 2); missed.Advance(11); check(missed.Finished(11) && missed.Score == 1000, "Mixed hits and misses finish");
            var dense = Sample(); dense.notes.Clear(); dense.notes.Add(new RhythmNote(1, Lane.Top)); dense.notes.Add(new RhythmNote(1.1, Lane.Top));
            var denseSession = new RhythmSession(dense); check(denseSession.Press(Lane.Top, 1.08).index == 0 && denseSession.Press(Lane.Top, 1.1).index == 1, "Dense notes retain order");
            var battle=new RhythmBattle(Sample(),Character.Rin);battle.Advance(1);
            check(battle.State.Hp==125&&battle.State.MaxHp==250,"Music Rin uses survival initial health");
            check(battle.Press(Lane.Top,1).judgment==RhythmJudgment.Perfect&&battle.State.Score==300&&battle.State.Hp==130,"Music critical shares score and healing");
            battle.Press(Lane.Bottom,1.1);check(battle.State.Score==500&&battle.State.NormalCount==1&&battle.State.Hp==135,"Music normal hit shares score and healing");
            battle.Advance(2.151);check(battle.State.Hp==135&&battle.State.Combo==0,"Opposite rail miss preserves health and breaks combo");
            var collision=new RhythmBattle(Sample(),Character.Zhe);collision.Advance(1.151);
            check(collision.State.Hp==280&&collision.State.MaxHp==300&&collision.Session.Miss==2,"Same rail miss costs twenty; Zhe starts at three hundred");
            collision.Advance(1.3);check(collision.State.Hp==280,"Miss damage cannot repeat");
            check(collision.State.Monsters.TrueForAll(m=>m.Removed),"Chart ticking adds no random monsters");
            var denseChart=new MusicChart {title="Shared combat",duration=20};
            for(int i=0;i<60;i++)denseChart.notes.Add(new RhythmNote(1+i*.05,Lane.Bottom));
            var rewards=new RhythmBattle(denseChart,Character.Rin);
            for(int i=0;i<25;i++){double t=denseChart.notes[i].time;rewards.Advance(t);rewards.Press(Lane.Bottom,t);}
            check(rewards.State.Burning&&rewards.State.Hp==250&&rewards.State.Score==7500,"Twenty-five Rin hits start burning after scoring");
            rewards.Advance(denseChart.notes[25].time);rewards.Press(Lane.Bottom,denseChart.notes[25].time);
            check(rewards.State.Score==8100,"Burn doubles shared critical score");
            for(int i=26;i<50;i++){double t=denseChart.notes[i].time;rewards.Advance(t);rewards.Press(Lane.Bottom,t);}
            check(rewards.State.Fever&&rewards.State.Combo==50&&rewards.State.Score==22800,"Fiftieth hit starts FEVER and stacks with burning");
            rewards.Advance(15);
            check(!rewards.State.Fever&&rewards.State.Combo==0,"Miss ends shared FEVER");
            var lethalChart=new MusicChart {title="Health failure",duration=20};
            for(int i=0;i<20;i++)lethalChart.notes.Add(new RhythmNote(1+i*.3,Lane.Bottom));
            var lethal=new RhythmBattle(lethalChart,Character.Zhe);lethal.Advance(10);
            check(lethal.State.Hp==0&&lethal.State.Phase==Phase.Over&&lethal.Finished(10),"Music level ends when health is exhausted");
            check(lethal.Session.Miss==20&&Array.TrueForAll(lethal.Session.Judgments,j=>j!=RhythmJudgment.Pending),"Health failure accounts for every remaining note");
            var passive=new Game(1,1,Character.Rin);passive.S.Burning=true;passive.S.Hp=126;passive.TickChart(.05);passive.TickChart(.05);
            check(passive.S.Hp==125&&!passive.S.Burning,"Music burning respects survival health floor");
            var noSpawn=new Game(1,1,Character.Zhe);for(int i=0;i<1000;i++)noSpawn.TickChart(.05);
            check(noSpawn.S.Monsters.Count==0,"Long chart playback never spawns unscripted monsters");
            noSpawn.S.Phase=Phase.Paused;double frozenNow=noSpawn.S.Now;noSpawn.TickChart(.05);
            check(noSpawn.S.Now==frozenNow,"Shared combat timers freeze while paused");
            var savedJson = JsonUtility.ToJson(Sample()); var roundtrip = JsonUtility.FromJson<MusicChart>(savedJson); roundtrip.Validate();
            check(roundtrip.notes.Count == 3 && roundtrip.notes[1].rail == Lane.Bottom && roundtrip.notes[2].time == 2, "JSON preserves exact timestamps and rails");
            string root = Path.Combine(Application.temporaryCachePath, "DashingMusicChecks-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root); string audio = Path.Combine(root, "source.mp3"); File.WriteAllBytes(audio, new byte[] { 73, 68, 51, 1 });
                var store = new MusicLevelStore(Path.Combine(root, "levels")); var level = store.Save(Sample(), audio); int skipped;
                check(File.Exists(level.AudioPath) && level.Chart.id.Length == 32, "Atomic self-contained save");
                File.Delete(audio); check(store.Load(out skipped).Count == 1 && skipped == 0, "Saved level survives deleting source");
                var again = store.Load(out skipped)[0]; check(again.Chart.notes.Count == 3, "Level survives new store instance");
                Directory.CreateDirectory(Path.Combine(store.Root, "broken")); File.WriteAllText(Path.Combine(store.Root, "broken/chart.json"), "bad");
                check(store.Load(out skipped).Count == 1 && skipped == 1, "Corrupt level does not hide valid levels");
                Directory.CreateDirectory(Path.Combine(store.Root, ".saving-interrupted"));
                check(store.Load(out skipped).Count == 1 && skipped == 1, "Interrupted save hidden from library");
                File.Delete(level.AudioPath); check(store.Load(out skipped).Count == 0 && skipped == 2, "Missing saved audio handled");
                rejects(() => store.Save(Sample(), audio), "Missing source fails without creating level");
                check(Directory.GetDirectories(store.Root).Length == 3, "Failed save leaves no extra directories");
                File.WriteAllBytes(audio, new byte[0]); rejects(() => MusicLevelStore.CheckAudio(audio), "Reject empty audio");
                rejects(() => MusicLevelStore.CheckAudio(Path.Combine(root, "source.wav")), "Reject unsupported extension");
            }
            finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
            log.AppendLine("DASHING_MUSIC_CHECKS_PASS " + count + " assertions"); return log.ToString();
        }
        private static MusicChart Sample()
        {
            var chart = new MusicChart { title = "测试关卡", duration = 10 };
            chart.notes.Add(new RhythmNote(1, Lane.Top)); chart.notes.Add(new RhythmNote(1, Lane.Bottom)); chart.notes.Add(new RhythmNote(2, Lane.Top)); return chart;
        }
    }
}
