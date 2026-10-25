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
            CheckAuthoredMonsters(check, rejects);
            log.AppendLine("DASHING_MUSIC_CHECKS_PASS " + count + " assertions"); return log.ToString();
        }
        private static MusicChart HoldChart(double length)
        {
            var chart = new MusicChart { title = "Recorded hold", duration = 12 };
            chart.notes.Add(new RhythmNote(1, Lane.Top, MonsterKind.Hold, length)); return chart;
        }
        private static MusicChart TwinChart()
        {
            var chart = new MusicChart { title = "Recorded twins", duration = 6 };
            chart.notes.Add(new RhythmNote(1, Lane.Top, MonsterKind.Twin, 0, 7));
            chart.notes.Add(new RhythmNote(1, Lane.Bottom, MonsterKind.Twin, 0, 7)); return chart;
        }
        private static void CheckAuthoredMonsters(Action<bool, string> check, Action<Action, string> rejects)
        {
            var recorder = new ChartRecorder();
            check(recorder.Press(1, Lane.Top, 12, "W"), "Press begins a recording immediately");
            check(!recorder.Press(1.1, Lane.Top, 12, "W") && !recorder.Press(1.1, Lane.Top, 12, "Up"), "Held input and same-rail alternate key do not duplicate notes");
            check(recorder.Release("W", 1.1, 12) && recorder.Notes[0].kind == MonsterKind.Normal, "Short press stays a normal monster");
            recorder.Press(2, Lane.Bottom, 12, "S"); recorder.Release("S", 4.735, 12);
            check(recorder.Notes[1].kind == MonsterKind.Hold && Math.Abs(recorder.Notes[1].duration - 2.735) < 1e-9, "Record exact long press duration without fixed two-second rounding");
            recorder.Press(5, Lane.Top, 12, "W"); recorder.Release("W", 5.2, 12);
            check(recorder.Notes[2].kind == MonsterKind.Hold, "Two-hundred-millisecond hold threshold is inclusive");
            recorder.Press(6, Lane.Bottom, 12, "S", true);
            check(recorder.Notes.Count == 5 && recorder.Notes[3].kind == MonsterKind.Twin && recorder.Notes[3].pairId == recorder.Notes[4].pairId && recorder.Notes[3].time == recorder.Notes[4].time && recorder.Notes[3].rail != recorder.Notes[4].rail, "Twin input records both rails atomically");
            check(recorder.Undo() && recorder.Notes.Count == 3 && recorder.Notes.TrueForAll(n => n.kind != MonsterKind.Twin), "Undo removes both halves of authored twins");
            recorder.Press(10, Lane.Bottom, 12, "S"); recorder.Finish(13, 12);
            check(recorder.Notes[3].duration == 2, "Finish clips held note to song end");
            var ended = new MusicChart { title = "End trim", duration = 12, notes = recorder.Notes }; ended.Validate();
            var pending = new ChartRecorder(); pending.Press(1, Lane.Top, 10, "W"); pending.Undo();
            check(!pending.Release("W", 3, 10) && pending.Notes.Count == 0, "Undo held note cannot resurrect it on release");
            var overlap = new ChartRecorder(); overlap.Press(1, Lane.Top, 10, "W"); overlap.Press(1.2, Lane.Bottom, 10, "S");
            overlap.Release("W", 2, 10); overlap.Release("S", 2.2, 10);
            check(overlap.Notes[0].kind == MonsterKind.Hold && overlap.Notes[1].kind == MonsterKind.Normal && overlap.Warning != null, "Overlapping two-body holds retain a tap with explicit warning");
            var pauseClock = new SongTimeline(); pauseClock.Start(0, 0); var pausedRecorder = new ChartRecorder();
            pausedRecorder.Press(pauseClock.Time(1), Lane.Top, 10, "W"); pauseClock.Pause(1.4); pauseClock.Resume(100);
            pausedRecorder.Release("W", pauseClock.Time(100.3), 10);
            check(Math.Abs(pausedRecorder.Notes[0].duration - .7) < 1e-9, "Recorded duration excludes paused wall-clock time");
            foreach (double invalid in new[] { -.2, 0, .199, double.NaN, double.PositiveInfinity, 12 })
            { var bad = HoldChart(invalid); rejects(() => bad.Validate(), "Reject invalid authored hold duration " + invalid); }
            var badKind = Sample(); badKind.notes[0].kind = (MonsterKind)9; rejects(() => badKind.Validate(), "Reject unknown monster kind");
            var badTap = Sample(); badTap.notes[0].duration = 1; rejects(() => badTap.Validate(), "Reject duration on tap monster");
            var overlapChart = HoldChart(2); overlapChart.notes.Add(new RhythmNote(2, Lane.Top)); rejects(() => overlapChart.Validate(), "Reject other monsters inside held rail");
            var bothHeld = HoldChart(2); bothHeld.notes.Add(new RhythmNote(1.5, Lane.Bottom, MonsterKind.Hold, 2)); rejects(() => bothHeld.Validate(), "Reject overlapping long holds on both rails");
            var missingTwin = TwinChart(); missingTwin.notes.RemoveAt(1); rejects(() => missingTwin.Validate(), "Reject orphan twin");
            var sameRail = TwinChart(); sameRail.notes[1].rail = Lane.Top; rejects(() => sameRail.Validate(), "Reject twin on same rail");
            var shiftedTwin = TwinChart(); shiftedTwin.notes[1].time += .01; rejects(() => shiftedTwin.Validate(), "Reject mismatched twin onset");
            var wrongPair = TwinChart(); wrongPair.notes[0].pairId = 0; rejects(() => wrongPair.Validate(), "Reject missing twin pair identifier");
            var holdCopy = HoldChart(2.735).Copy(); check(holdCopy.notes[0].kind == MonsterKind.Hold && holdCopy.notes[0].duration == 2.735, "Chart copy preserves authored hold metadata");
            var twinCopy = TwinChart().Copy(); check(twinCopy.notes[1].pairId == 7 && twinCopy.notes[1].kind == MonsterKind.Twin, "Chart copy preserves twin links");
            var legacy = JsonUtility.FromJson<MusicChart>("{\"version\":1,\"title\":\"Legacy\",\"audioFile\":\"music.mp3\",\"duration\":4,\"notes\":[{\"time\":1,\"rail\":0}]}"); legacy.Validate();
            check(legacy.notes[0].kind == MonsterKind.Normal && legacy.notes[0].duration == 0, "Existing tap-only JSON remains playable");
            var roundtrip = JsonUtility.FromJson<MusicChart>(JsonUtility.ToJson(HoldChart(2.735))); roundtrip.Validate();
            check(roundtrip.notes[0].duration == 2.735 && roundtrip.notes[0].kind == MonsterKind.Hold, "JSON roundtrip preserves exact hold duration");
            var twinRoundtrip = JsonUtility.FromJson<MusicChart>(JsonUtility.ToJson(TwinChart())); twinRoundtrip.Validate();
            check(twinRoundtrip.notes[0].pairId == twinRoundtrip.notes[1].pairId, "JSON roundtrip preserves twin pairing");
            foreach (Character character in new[] { Character.Rin, Character.Zhe })
            {
                foreach (double length in new[] { .2, .375, 1.25, 2.735, 5.0 })
                {
                    var battle = new RhythmBattle(HoldChart(length), character); battle.Advance(1);
                    var head = battle.Press(Lane.Top, 1, "held");
                    check(head.index == 0 && head.judgment == RhythmJudgment.Pending && battle.State.HoldId != 0 && battle.State.Score == 200, character + " authored hold starts and awards head " + length);
                    battle.Advance(1 + length - .001);
                    check(battle.Session.Perfect == 0 && battle.State.HoldId != 0 && Math.Abs(battle.MonsterAt(0).HoldT - (length - .001)) < 1e-7, character + " hold lasts its actual recorded duration " + length);
                    battle.Release("other", 1 + length - .001); check(battle.State.HoldId != 0, character + " unrelated input release cannot break hold " + length);
                    battle.Advance(1 + length);
                    check(battle.State.HoldId == 0 && battle.MonsterAt(0).Removed && battle.Session.Perfect == 1 && battle.State.Score == 600 && battle.State.Combo == 1, character + " custom hold completes exactly once with shared three-part rewards " + length);
                    battle.Advance(1 + length + .1); battle.Release("held", 1 + length + .1);
                    check(battle.State.Score == 600 && battle.Session.Perfect == 1, character + " release after completed hold does not score twice " + length);
                }
                var earlyRelease = new RhythmBattle(HoldChart(2.735), character); earlyRelease.Advance(1); earlyRelease.Press(Lane.Top, 1, "held"); earlyRelease.Advance(1.2); earlyRelease.Release("held", 1.2);
                check(earlyRelease.Session.Miss == 1 && earlyRelease.State.HoldId == 0 && earlyRelease.State.Combo == 0 && earlyRelease.State.Score == 200, character + " early release fails and releases body without full reward");
                earlyRelease.Advance(6); check(earlyRelease.Session.Miss == 1 && earlyRelease.State.Score == 200, character + " failed hold cannot complete later");
                var soulChart = HoldChart(2.735); soulChart.notes.Add(new RhythmNote(2, Lane.Bottom));
                var soul = new RhythmBattle(soulChart, character); soul.Advance(1); soul.Press(Lane.Top, 1, "held"); soul.Advance(2); soul.Press(Lane.Bottom, 2, "soul");
                check(soul.State.HoldId != 0 && soul.State.PlayerLane == Lane.Top && soul.Combat.Cues.Exists(c => c.Kind == CueKind.Soul), character + " opposite-rail normal hit uses soul proxy during chart hold");
                soul.State.Phase = Phase.Paused; double now = soul.State.Now, progress = soul.MonsterAt(0).HoldT; soul.Advance(3);
                check(soul.State.Now == now && soul.MonsterAt(0).HoldT == progress, character + " paused chart freezes hold progress");
                soul.State.Phase = Phase.Running; soul.Advance(3.735);
                check(soul.Session.Perfect == 2 && soul.State.Score == 900 && soul.State.HoldId == 0, character + " soul and hold both settle independently");
                var twins = new RhythmBattle(TwinChart(), character); twins.Advance(1);
                check(twins.MonsterAt(0).Kind == MonsterKind.Twin && twins.MonsterAt(0).PartnerId == twins.MonsterAt(1).Id, character + " authored twins show linked pair");
                twins.Press(Lane.Top, 1); twins.Press(Lane.Top, 1.01); twins.Advance(1.05); twins.Press(Lane.Bottom, 1.05);
                check(twins.Session.Perfect == 2 && twins.State.Score == 1000 && twins.State.Combo == 2 && twins.MonsterAt(0).Removed && twins.MonsterAt(1).Removed, character + " twin two-rail critical uses survival pair reward");
                var lateTwin = new RhythmBattle(TwinChart(), character); lateTwin.Advance(1); lateTwin.Press(Lane.Bottom, 1); lateTwin.Advance(1.18); lateTwin.Press(Lane.Top, 1.18);
                check(lateTwin.Session.Good == 2 && lateTwin.Session.Miss == 0 && lateTwin.State.Score == 700, character + " twin second rail accepts inclusive 180ms window beyond ordinary late window");
                var solo = new RhythmBattle(TwinChart(), character); solo.Advance(1); solo.Press(Lane.Top, 1); int hp = solo.State.Hp; solo.Advance(1.181);
                check(solo.Session.Perfect == 1 && solo.Session.Miss == 1 && solo.State.Score == 300 && solo.State.Hp == hp + (character == Character.Rin ? 5 : 0) - 20, character + " twin timeout awards single hit and self-destructs other half once");
                solo.Advance(4); check(solo.Session.Miss == 1 && solo.State.Score == 300, character + " twin timeout cannot resolve twice");
                var twinMiss = new RhythmBattle(TwinChart(), character); int initialHp = twinMiss.State.Hp; twinMiss.Advance(1.151);
                check(twinMiss.Session.Miss == 2 && twinMiss.State.Hp == initialHp - 20, character + " unstruck twin pair causes one shared breach penalty");
            }
        }
        private static MusicChart Sample()
        {
            var chart = new MusicChart { title = "测试关卡", duration = 10 };
            chart.notes.Add(new RhythmNote(1, Lane.Top)); chart.notes.Add(new RhythmNote(1, Lane.Bottom)); chart.notes.Add(new RhythmNote(2, Lane.Top)); return chart;
        }
    }
}
