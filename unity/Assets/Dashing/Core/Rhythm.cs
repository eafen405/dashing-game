using System;
using System.Collections.Generic;

namespace Dashing.Core
{
    [Serializable]
    public sealed class RhythmNote
    {
        public double time;
        public Lane rail;
        public RhythmNote(double time, Lane rail) { this.time = time; this.rail = rail; }
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
            foreach (var note in notes)
            {
                if (note == null || !Finite(note.time) || note.time < 0 || note.time >= duration || (note.rail != Lane.Top && note.rail != Lane.Bottom))
                    throw new ArgumentException("谱面中存在无效时间或轨道。");
                if (note.time < previous) throw new ArgumentException("谱面音符必须按时间排序。");
                if (railPrevious[(int)note.rail] >= 0 && note.time - railPrevious[(int)note.rail] < .025 - 1e-9)
                    throw new ArgumentException("同一轨道的音符间隔不能小于 25 毫秒。");
                previous = railPrevious[(int)note.rail] = note.time;
            }
        }
        public MusicChart Copy()
        {
            var copy = new MusicChart { version = version, id = id, title = title, createdUtc = createdUtc, audioFile = audioFile, duration = duration };
            foreach (var note in notes) copy.notes.Add(new RhythmNote(note.time, note.rail));
            return copy;
        }
        public static bool Finite(double value) { return !double.IsNaN(value) && !double.IsInfinity(value); }
    }

    public sealed class ChartRecorder
    {
        public readonly List<RhythmNote> Notes = new List<RhythmNote>();
        public bool Record(double songTime, Lane rail, double duration)
        {
            if (!MusicChart.Finite(songTime) || songTime < 0 || songTime >= duration || Notes.Count >= 50000 || (rail != Lane.Top && rail != Lane.Bottom)) return false;
            for (int i = Notes.Count - 1; i >= 0; i--)
                if (Notes[i].rail == rail) { if (songTime - Notes[i].time < .025 - 1e-9) return false; break; }
            if (Notes.Count > 0 && songTime < Notes[Notes.Count - 1].time) return false;
            Notes.Add(new RhythmNote(songTime, rail)); return true;
        }
        public bool Undo() { if (Notes.Count == 0) return false; Notes.RemoveAt(Notes.Count - 1); return true; }
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
        private readonly List<int>[] rails = { new List<int>(), new List<int>() };
        private readonly int[] cursor = new int[2];
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
            for (int i = 0; i < Chart.notes.Count; i++) rails[(int)Chart.notes[i].rail].Add(i);
        }
        public void Advance(double songTime)
        {
            Expired.Clear();
            for (int rail = 0; rail < 2; rail++)
                while (cursor[rail] < rails[rail].Count)
                {
                    int i = rails[rail][cursor[rail]];
                    if (songTime - Chart.notes[i].time <= GoodWindow + 1e-9) break;
                    cursor[rail]++; Judgments[i] = RhythmJudgment.Miss; Miss++; Combo = 0;
                    Expired.Add(new RhythmResult { index = i, judgment = RhythmJudgment.Miss, error = songTime - Chart.notes[i].time });
                }
        }
        // The first unjudged note on the rail owns the window; a press can consume exactly one note.
        public RhythmResult Press(Lane rail, double songTime)
        {
            var none = new RhythmResult { index = -1 };
            if (rail != Lane.Top && rail != Lane.Bottom) return none;
            int r = (int)rail;
            if (cursor[r] >= rails[r].Count) return none;
            int i = rails[r][cursor[r]]; double error = songTime - Chart.notes[i].time;
            if (Math.Abs(error) > GoodWindow + 1e-9) return none;
            cursor[r]++; var judgment = Math.Abs(error) <= PerfectWindow + 1e-9 ? RhythmJudgment.Perfect : RhythmJudgment.Good;
            Judgments[i] = judgment; if (judgment == RhythmJudgment.Perfect) Perfect++; else Good++;
            Combo++; MaxCombo = Math.Max(MaxCombo, Combo);
            return new RhythmResult { index = i, error = error, judgment = judgment };
        }
        public bool Finished(double songTime) { return songTime >= Chart.duration + GoodWindow && Perfect + Good + Miss == Chart.notes.Count; }
        public void FinishRemaining()
        {
            for(int r=0;r<2;r++)while(cursor[r]<rails[r].Count){int i=rails[r][cursor[r]++];Judgments[i]=RhythmJudgment.Miss;Miss++;}
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
        public RhythmBattle(MusicChart chart,Character character,Layout layout=null)
        {Session=new RhythmSession(chart);Combat=new Game(12345,1,character,layout);}
        public Monster MonsterAt(int index)
        {
            Monster monster;if(monsters.TryGetValue(index,out monster))return monster;
            var note=Session.Chart.notes[index];var l=State.Layout;
            monster=new Monster {Id=index+1,Kind=MonsterKind.Normal,Lane=note.rail,X=l.HitX,Y=l.Y(note.rail),W=42,H=42,Sf=1};
            monsters.Add(index,monster);State.Monsters.Add(monster);return monster;
        }
        public void Advance(double songTime)
        {
            if(State.Phase!=Phase.Running)return;
            double target=Math.Max(0,songTime);
            while(target-elapsed>1e-9&&State.Phase==Phase.Running){double step=Math.Min(.05,target-elapsed);Combat.TickChart(step);elapsed+=step;}
            Session.Advance(songTime);
            foreach(var expired in Session.Expired)Combat.MissChart(MonsterAt(expired.index));
            if(State.Phase==Phase.Over)Session.FinishRemaining();
        }
        public RhythmResult Press(Lane rail,double songTime)
        {
            if(State.Phase!=Phase.Running)return new RhythmResult {index=-1};
            var result=Session.Press(rail,songTime);
            Combat.PressChart(rail,result.index<0?null:MonsterAt(result.index),result.judgment==RhythmJudgment.Perfect);
            return result;
        }
        public bool Finished(double songTime){return State.Phase==Phase.Over||Session.Finished(songTime);}
    }
}
