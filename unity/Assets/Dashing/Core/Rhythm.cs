using System;
using System.Collections.Generic;

namespace Dashing.Core
{
    [Serializable]
    public sealed class RhythmNote
    {
        public double time;
        public Lane rail;
        // Optional fields keep existing single-tap v1 charts readable.
        public MonsterKind kind;
        public double duration;
        public int pairId;
        public RhythmNote(double time, Lane rail, MonsterKind kind = MonsterKind.Normal, double duration = 0, int pairId = 0)
        { this.time = time; this.rail = rail; this.kind = kind; this.duration = duration; this.pairId = pairId; }
    }

    [Serializable]
    public sealed class MusicChart
    {
        public int version = 1;
        public string id, title, createdUtc;
        public string audioFile = "music.mp3";
        public double duration;
        public List<RhythmNote> notes = new List<RhythmNote>();

        public void Validate(bool requireNotes = true)
        {
            if (version != 1) throw new ArgumentException("不支持此谱面版本。");
            if (string.IsNullOrWhiteSpace(title) || title.Length > 60) throw new ArgumentException("关卡名称需要 1–60 个字符。");
            if (!Finite(duration) || duration <= 0 || duration > 1800) throw new ArgumentException("音乐时长必须在 0–30 分钟内。");
            if (audioFile != "music.mp3") throw new ArgumentException("关卡音频文件名无效。");
            if (notes == null || notes.Count > 50000 || (requireNotes && notes.Count == 0)) throw new ArgumentException("请至少录制一个音符（最多 50000 个）。");
            double previous = -1;
            double[] railPrevious = { -1, -1 };
            double[] railEnd = { -1, -1 };
            double holdEnd = -1;
            var pairs = new Dictionary<int, RhythmNote>();
            var pairCounts = new Dictionary<int, int>();
            foreach (var note in notes)
            {
                if (note == null || !Finite(note.time) || note.time < 0 || note.time >= duration || (note.rail != Lane.Top && note.rail != Lane.Bottom))
                    throw new ArgumentException("谱面中存在无效时间或轨道。");
                if (note.time < previous) throw new ArgumentException("谱面音符必须按时间排序。");
                if (!Finite(note.duration) || (note.kind != MonsterKind.Normal && note.kind != MonsterKind.Hold && note.kind != MonsterKind.Twin))
                    throw new ArgumentException("谱面中存在无效怪物类型或长按时长。");
                if (note.time < railEnd[(int)note.rail] - 1e-9)
                    throw new ArgumentException("长按结束前，同轨不能录入其他怪物。");
                if (note.kind == MonsterKind.Hold)
                {
                    if (note.duration < ChartRecorder.HoldThreshold - 1e-9 || note.time + note.duration > duration + 1e-9 || note.pairId != 0)
                        throw new ArgumentException("长按时长至少 200 毫秒，且不能超出音乐结尾。");
                    if (note.time < holdEnd - 1e-9) throw new ArgumentException("两条轨道的长按不能重叠；另一轨可以录入单击。");
                    holdEnd = railEnd[(int)note.rail] = note.time + note.duration;
                }
                else if (note.duration != 0) throw new ArgumentException("只有长按怪可以包含持续时长。");
                if (note.kind == MonsterKind.Twin)
                {
                    if (note.pairId <= 0) throw new ArgumentException("双生必须有配对编号。");
                    RhythmNote mate;
                    if (pairs.TryGetValue(note.pairId, out mate))
                    {
                        if (mate.rail == note.rail || Math.Abs(mate.time - note.time) > 1e-9 || pairCounts[note.pairId] != 1)
                            throw new ArgumentException("双生必须同一时刻分占上下轨道。");
                        pairCounts[note.pairId]++;
                    }
                    else { pairs.Add(note.pairId, note); pairCounts.Add(note.pairId, 1); }
                }
                else if (note.pairId != 0) throw new ArgumentException("只有双生可以包含配对编号。");
                if (railPrevious[(int)note.rail] >= 0 && note.time - railPrevious[(int)note.rail] < .025 - 1e-9)
                    throw new ArgumentException("同一轨道的音符间隔不能小于 25 毫秒。");
                previous = railPrevious[(int)note.rail] = note.time;
            }
            foreach (var pair in pairCounts) if (pair.Value != 2) throw new ArgumentException("双生必须成对保存。");
        }
        public MusicChart Copy()
        {
            var copy = new MusicChart { version = version, id = id, title = title, createdUtc = createdUtc, audioFile = audioFile, duration = duration };
            foreach (var note in notes) copy.notes.Add(new RhythmNote(note.time, note.rail, note.kind, note.duration, note.pairId));
            return copy;
        }
        public static bool Finite(double value) { return !double.IsNaN(value) && !double.IsInfinity(value); }
    }

    public sealed class ChartRecorder
    {
        public const double HoldThreshold = .2;
        public readonly List<RhythmNote> Notes = new List<RhythmNote>();
        private readonly Dictionary<string, RhythmNote> held = new Dictionary<string, RhythmNote>();
        private int nextPair;
        public string Warning { get; private set; }
        public RhythmNote LastReleased { get; private set; }
        public IEnumerable<RhythmNote> HeldNotes { get { return held.Values; } }
        private bool CanRecord(double songTime, Lane rail, double duration)
        {
            if (!MusicChart.Finite(songTime) || !MusicChart.Finite(duration) || duration <= 0 || songTime < 0 || songTime >= duration || Notes.Count >= 50000 || (rail != Lane.Top && rail != Lane.Bottom)) return false;
            foreach (var note in held.Values) if (note.rail == rail) return false;
            for (int i = Notes.Count - 1; i >= 0; i--)
                if (Notes[i].rail == rail)
                { if (songTime - Notes[i].time < .025 - 1e-9 || songTime < Notes[i].time + Notes[i].duration - 1e-9) return false; break; }
            return Notes.Count == 0 || songTime >= Notes[Notes.Count - 1].time;
        }
        public bool Record(double songTime, Lane rail, double duration)
        {
            if (!CanRecord(songTime, rail, duration)) return false;
            Notes.Add(new RhythmNote(songTime, rail)); return true;
        }
        public bool Press(double songTime, Lane rail, double duration, string input, bool twin = false)
        {
            Warning = null;
            if (string.IsNullOrEmpty(input) || held.ContainsKey(input) || (rail != Lane.Top && rail != Lane.Bottom)) return false;
            if (twin)
            {
                if (Notes.Count > 49998 || !CanRecord(songTime, Lane.Top, duration) || !CanRecord(songTime, Lane.Bottom, duration)) return false;
                int pair = ++nextPair;
                Notes.Add(new RhythmNote(songTime, Lane.Top, MonsterKind.Twin, 0, pair));
                Notes.Add(new RhythmNote(songTime, Lane.Bottom, MonsterKind.Twin, 0, pair)); return true;
            }
            if (!Record(songTime, rail, duration)) return false;
            held.Add(input, Notes[Notes.Count - 1]); return true;
        }
        public bool Release(string input, double songTime, double duration)
        {
            Warning = null; RhythmNote note;
            if (!MusicChart.Finite(songTime) || !held.TryGetValue(input, out note)) return false;
            held.Remove(input); LastReleased = note;
            double length = Math.Min(duration, songTime) - note.time;
            if (length < HoldThreshold - 1e-9) return true;
            foreach (var other in Notes)
            {
                if (other == note) continue;
                if ((other.rail == note.rail && other.time > note.time && other.time < note.time + length - 1e-9) ||
                    (other.kind == MonsterKind.Hold && other.time < note.time + length - 1e-9 && other.time + other.duration > note.time + 1e-9))
                { Warning = "长按重叠，当前输入保留为单击；另一轨请使用短按。"; return true; }
            }
            note.kind = MonsterKind.Hold; note.duration = length; return true;
        }
        public double PreviewDuration(RhythmNote note, double songTime)
        {
            foreach (var active in held.Values) if (active == note) return Math.Max(0, songTime - note.time);
            return note.duration;
        }
        public void Finish(double songTime, double duration)
        { foreach (var input in new List<string>(held.Keys)) Release(input, songTime, duration); }
        public bool Undo()
        {
            if (Notes.Count == 0) return false;
            int pair = Notes[Notes.Count - 1].pairId;
            if (pair == 0) Notes.RemoveAt(Notes.Count - 1); else Notes.RemoveAll(n => n.pairId == pair);
            foreach (var input in new List<string>(held.Keys)) if (!Notes.Contains(held[input])) held.Remove(input);
            return true;
        }
    }

    // One origin shared by audio, recording, animation and judgment; pauses never accumulate drift.
    public sealed class SongTimeline
    {
        private double origin, frozen;
        public bool Paused { get; private set; }
        public void Start(double dspTime, double leadIn) { origin = dspTime + leadIn; frozen = -leadIn; Paused = false; }
        public double Time(double dspTime) { return Paused ? frozen : dspTime - origin; }
        public void Pause(double dspTime) { if (Paused) return; frozen = Time(dspTime); Paused = true; }
        public void Resume(double dspTime) { if (!Paused) return; origin = dspTime - frozen; Paused = false; }
    }

    public enum RhythmJudgment { Pending, Perfect, Good, Miss }
    public struct RhythmResult
    {
        public int index;
        public double error;
        public RhythmJudgment judgment;
    }

    public sealed class RhythmSession
    {
        public const double PerfectWindow = .06, GoodWindow = .15, Approach = 2;
        public readonly MusicChart Chart;
        public readonly RhythmJudgment[] Judgments;
        public readonly List<RhythmResult> Expired = new List<RhythmResult>();
        public readonly List<RhythmResult> Completed = new List<RhythmResult>();
        private readonly List<int>[] rails = { new List<int>(), new List<int>() };
        private readonly int[] cursor = new int[2];
        private readonly int[] mates;
        private readonly double[] started, errors;
        private readonly string[] inputs;
        private readonly List<int> holds = new List<int>(), twins = new List<int>();
        public IEnumerable<int> ActiveHolds { get { return holds; } }
        public int Partner(int index) { return mates[index]; }
        public double HoldProgress(int index, double songTime)
        { return holds.Contains(index) ? MathEx.Clamp(songTime - started[index], 0, Chart.notes[index].duration) : 0; }
        public bool Holding(int index) { return holds.Contains(index); }
        public int Perfect { get; private set; }
        public int Good { get; private set; }
        public int Miss { get; private set; }
        public int Combo { get; private set; }
        public int MaxCombo { get; private set; }
        public int Score { get { return Perfect * 1000 + Good * 500; } }
        public double Accuracy { get { return Chart.notes.Count == 0 ? 0 : (Perfect + Good * .5) / Chart.notes.Count; } }
        public RhythmSession(MusicChart chart)
        {
            chart.Validate(); Chart = chart.Copy(); Judgments = new RhythmJudgment[Chart.notes.Count];
            mates = new int[Chart.notes.Count]; started = new double[Chart.notes.Count]; errors = new double[Chart.notes.Count]; inputs = new string[Chart.notes.Count];
            var pairs = new Dictionary<int, int>();
            for (int i = 0; i < Chart.notes.Count; i++)
            {
                rails[(int)Chart.notes[i].rail].Add(i); mates[i] = -1;
                if (Chart.notes[i].kind != MonsterKind.Twin) continue;
                int mate; if (pairs.TryGetValue(Chart.notes[i].pairId, out mate)) { mates[i] = mate; mates[mate] = i; }
                else pairs.Add(Chart.notes[i].pairId, i);
            }
        }
        private RhythmResult Judge(int index, RhythmJudgment judgment, double error, bool breakCombo = true)
        {
            var result = new RhythmResult { index = index, judgment = judgment, error = error };
            if (Judgments[index] != RhythmJudgment.Pending) return result;
            Judgments[index] = judgment;
            if (judgment == RhythmJudgment.Miss) { Miss++; if (breakCombo) Combo = 0; Expired.Add(result); }
            else
            {
                if (judgment == RhythmJudgment.Perfect) Perfect++; else Good++;
                Combo++; MaxCombo = Math.Max(MaxCombo, Combo); Completed.Add(result);
            }
            return result;
        }
        private void SkipJudged(int rail)
        { while (cursor[rail] < rails[rail].Count && Judgments[rails[rail][cursor[rail]]] != RhythmJudgment.Pending) cursor[rail]++; }
        private double HoldEnd(int index)
        { return Math.Max(Chart.notes[index].time, started[index]) + Chart.notes[index].duration; }
        public void Advance(double songTime)
        {
            Expired.Clear(); Completed.Clear();
            for (int h = holds.Count - 1; h >= 0; h--)
            {
                int i = holds[h]; if (songTime < HoldEnd(i) - 1e-9) continue;
                holds.RemoveAt(h); Judge(i, Math.Abs(errors[i]) <= PerfectWindow + 1e-9 ? RhythmJudgment.Perfect : RhythmJudgment.Good, errors[i]);
            }
            for (int t = twins.Count - 1; t >= 0; t--)
            {
                int i = twins[t]; if (songTime <= started[i] + Game.PairWindow + 1e-9) continue;
                twins.RemoveAt(t);
                Judge(i, Math.Abs(errors[i]) <= PerfectWindow + 1e-9 ? RhythmJudgment.Perfect : RhythmJudgment.Good, errors[i]);
                Judge(mates[i], RhythmJudgment.Miss, songTime - Chart.notes[mates[i]].time, false);
            }
            for (int rail = 0; rail < 2; rail++)
            {
                SkipJudged(rail);
                while (cursor[rail] < rails[rail].Count)
                {
                    int i = rails[rail][cursor[rail]];
                    if (mates[i] >= 0 && twins.Contains(mates[i])) break;
                    if (songTime - Chart.notes[i].time <= GoodWindow + 1e-9) break;
                    cursor[rail]++; Judge(i, RhythmJudgment.Miss, songTime - Chart.notes[i].time); SkipJudged(rail);
                }
            }
        }
        // The first unjudged note on the rail owns the window; a press can consume exactly one note.
        public RhythmResult Press(Lane rail, double songTime, string input = "chart")
        {
            Completed.Clear();
            var none = new RhythmResult { index = -1 };
            if (!MusicChart.Finite(songTime) || (rail != Lane.Top && rail != Lane.Bottom)) return none;
            foreach (int active in holds) if (Chart.notes[active].rail == rail) return none;
            int r = (int)rail;
            SkipJudged(r);
            if (cursor[r] >= rails[r].Count) return none;
            int i = rails[r][cursor[r]]; double error = songTime - Chart.notes[i].time;
            bool completingTwin = mates[i] >= 0 && twins.Contains(mates[i]);
            if (completingTwin ? songTime > started[mates[i]] + Game.PairWindow + 1e-9 : Math.Abs(error) > GoodWindow + 1e-9) return none;
            if (Chart.notes[i].kind == MonsterKind.Hold && holds.Count != 0) return none;
            cursor[r]++; var judgment = Math.Abs(error) <= PerfectWindow + 1e-9 ? RhythmJudgment.Perfect : RhythmJudgment.Good;
            if (Chart.notes[i].kind == MonsterKind.Hold)
            { started[i] = songTime; errors[i] = error; inputs[i] = input; holds.Add(i); return new RhythmResult { index = i, error = error }; }
            if (Chart.notes[i].kind == MonsterKind.Twin)
            {
                if (!completingTwin)
                { started[i] = songTime; errors[i] = error; twins.Add(i); return new RhythmResult { index = i, error = error }; }
                int mate = mates[i]; twins.Remove(mate);
                if (Math.Abs(errors[mate]) > PerfectWindow + 1e-9) judgment = RhythmJudgment.Good;
                Judge(mate, judgment, errors[mate]);
            }
            return Judge(i, judgment, error);
        }
        public RhythmResult Release(string input, double songTime)
        {
            Expired.Clear(); Completed.Clear();
            foreach (int i in holds) if (inputs[i] == input)
            {
                holds.Remove(i);
                return Judge(i, songTime >= HoldEnd(i) - 1e-9 ?
                    (Math.Abs(errors[i]) <= PerfectWindow + 1e-9 ? RhythmJudgment.Perfect : RhythmJudgment.Good) : RhythmJudgment.Miss, errors[i]);
            }
            return new RhythmResult { index = -1 };
        }
        public bool Finished(double songTime) { return songTime >= Chart.duration + GoodWindow && Perfect + Good + Miss == Chart.notes.Count; }
        public void FinishRemaining()
        {
            for(int i=0;i<Judgments.Length;i++)if(Judgments[i]==RhythmJudgment.Pending){Judgments[i]=RhythmJudgment.Miss;Miss++;}
            holds.Clear(); twins.Clear(); cursor[0]=rails[0].Count; cursor[1]=rails[1].Count;
            Combo=0;
        }
    }

    // A chart replaces random spawning and distance-based judgment; combat stays in Game.
    public sealed class RhythmBattle
    {
        public readonly RhythmSession Session;
        public readonly Game Combat;
        public GameState State {get {return Combat.S;}}
        private readonly Dictionary<int,Monster> monsters=new Dictionary<int,Monster>();
        private double elapsed;
        private readonly List<RhythmResult> advanceExpired = new List<RhythmResult>();
        public RhythmBattle(MusicChart chart,Character character,Layout layout=null)
        {Session=new RhythmSession(chart);Combat=new Game(12345,1,character,layout);}
        public Monster MonsterAt(int index)
        {
            Monster monster;if(monsters.TryGetValue(index,out monster))return monster;
            var note=Session.Chart.notes[index];var l=State.Layout;
            monster=new Monster {Id=index+1,Kind=note.kind,Lane=note.rail,X=l.HitX,Y=l.Y(note.rail),W=42,H=42,Sf=1,
                PairId=note.pairId,HoldDuration=note.kind==MonsterKind.Hold?note.duration:2};
            monsters.Add(index,monster);State.Monsters.Add(monster);
            int mateIndex = Session.Partner(index);
            if (mateIndex >= 0)
            { var mate = MonsterAt(mateIndex); if (!mate.Removed) { monster.PartnerId = mate.Id; mate.PartnerId = monster.Id; } }
            return monster;
        }
        private void ApplyResults(double songTime)
        {
            foreach (int index in Session.ActiveHolds) Combat.TickChartHold(MonsterAt(index), Session.HoldProgress(index, songTime));
            foreach (var result in Session.Completed)
            {
                var monster = MonsterAt(result.index);
                if (monster.Kind == MonsterKind.Hold) Combat.CompleteChartHold(monster);
                else if (monster.Kind == MonsterKind.Twin) Combat.FailChartTwin(monster);
            }
            foreach (var expired in Session.Expired) Combat.MissChart(MonsterAt(expired.index));
        }
        public void Advance(double songTime)
        {
            if(State.Phase!=Phase.Running)return;
            double target=Math.Max(0,songTime);
            advanceExpired.Clear();
            while(target-elapsed>1e-9&&State.Phase==Phase.Running)
            {
                double step=Math.Min(.05,target-elapsed);Combat.TickChart(step);elapsed+=step;
                Session.Advance(elapsed); ApplyResults(elapsed); advanceExpired.AddRange(Session.Expired);
            }
            Session.Advance(songTime); ApplyResults(songTime); advanceExpired.AddRange(Session.Expired);
            Session.Expired.Clear(); Session.Expired.AddRange(advanceExpired);
            if(State.Phase==Phase.Over)Session.FinishRemaining();
        }
        public RhythmResult Press(Lane rail,double songTime,string input="chart")
        {
            if(State.Phase!=Phase.Running)return new RhythmResult {index=-1};
            var result=Session.Press(rail,songTime,input);
            Combat.PressChart(rail,result.index<0?null:MonsterAt(result.index),Math.Abs(result.error)<=RhythmSession.PerfectWindow+1e-9,input);
            return result;
        }
        public RhythmResult Release(string input, double songTime)
        {
            if (State.Phase != Phase.Running) return new RhythmResult { index = -1 };
            var result = Session.Release(input, songTime);
            if (result.index >= 0)
            { if (result.judgment == RhythmJudgment.Miss) Combat.FailChartHold(MonsterAt(result.index)); else Combat.CompleteChartHold(MonsterAt(result.index)); }
            return result;
        }
        public bool Finished(double songTime){return State.Phase==Phase.Over||Session.Finished(songTime);}
    }
}
