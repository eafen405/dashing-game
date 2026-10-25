using System;
using System.Collections.Generic;

namespace Dashing.Core
{
    // Native deterministic port of src/game/rules. No Unity/time/input/render dependencies.
    public sealed class Game
    {
        public const double AttackDuration = .44, PairWindow = .18;
        public readonly GameState S;
        public readonly Mulberry32 Rng;
        public readonly List<Cue> Cues = new List<Cue>(64);
        private readonly List<int> breached = new List<int>(32);
        private readonly List<int> expired = new List<int>(8);
        public Game(uint seed, int difficulty, Character character, Layout layout = null)
        {
            Rng = new Mulberry32(seed);
            S = new GameState { Seed = seed, Difficulty = Math.Max(1, Math.Min(4, difficulty)),
                Character = character, Layout = layout ?? new Layout(),
                MaxHp = character == Character.Rin ? 250 : 300, Hp = character == Character.Rin ? 125 : 300 };
        }
        public Monster Find(int id)
        { for (int i = 0; i < S.Monsters.Count; i++) if (S.Monsters[i].Id == id) return S.Monsters[i]; return null; }
        public Monster LongInLane(Lane lane)
        { foreach (var m in S.Monsters) if (m.Kind == MonsterKind.Hold && !m.Removed && m.Lane == lane) return m; return null; }
        public double Multiplier { get { return (S.Burning ? 2 : 1) * (S.Fever ? 1.5 : 1); } }
        public static double SpawnMultiplier(int d) { return d == 2 ? 2 : d == 3 ? 3 : d == 4 ? 2.5 : 1; }
        public static double SpeedMultiplier(int d) { return d == 2 ? 1.5 : d == 4 ? 2 : 1; }
        public double Speed
        { get { double t = MathEx.Clamp(S.Now / 75, 0, 1); return (165 + 135 * t * t * (3 - 2 * t)) * SpeedMultiplier(S.Difficulty); } }
        private void Emit(CueKind kind, Monster m, bool crit = false, string text = "")
        { Cues.Add(new Cue(kind, m.X, m.Y, m.Lane, crit, text)); }
        private void Notice(string text)
        { Cues.Add(new Cue(CueKind.Notice, S.Layout.HitX, S.Layout.Y(S.PlayerLane), S.PlayerLane, false, text)); }
        private void Heal()
        {
            if (S.Character != Character.Rin || S.Burning || S.Hp >= S.MaxHp) return;
            S.Hp = Math.Min(S.MaxHp, S.Hp + 5);
            if (S.Hp >= S.MaxHp) { S.Burning = true; S.BurnCarry = 0; Notice("燃魂！得分 ×2"); }
        }
        private bool TriggerFever()
        {
            if (S.Fever || S.Combo < S.NextFeverAt) return false;
            S.Fever = true; S.FeverT = 10; S.NextFeverAt = S.Combo + 50;
            Cues.Add(new Cue(CueKind.FeverStart, S.Layout.HitX, 360, S.PlayerLane, false, "FEVER! 10 秒 ×1.5"));
            return true;
        }
        public void EndFever()
        {
            bool was = S.Fever; S.Fever = false; S.FeverT = 0;
            if (was) Cues.Add(new Cue(CueKind.FeverEnd, 0, 0, S.PlayerLane, false, "FEVER 结束"));
        }
        private void BreakCombo() { S.Combo = 0; EndFever(); S.NextFeverAt = 50; }
        private void AddCombo(int count, bool crit)
        {
            S.Combo += count; S.Kills += count; S.MaxCombo = Math.Max(S.MaxCombo, S.Combo);
            if (crit) S.CritCount += count; else S.NormalCount += count;
            TriggerFever();
        }
        private int Kill(Monster m, bool crit)
        {
            if (m == null || m.Removed) return 0;
            m.Removed = true; AddCombo(1, crit);
            int gain = MathEx.Round((crit ? 300 : 200) * Multiplier); S.Score += gain;
            Emit(CueKind.Hit, m, crit, (crit ? "暴击" : "命中") + "  +" + gain); Heal();
            if (m.Kind == MonsterKind.Twin && m.PartnerId != 0)
            {
                var p = Find(m.PartnerId);
                if (p != null) { p.PartnerId = 0; p.PairPending = p.PairCrit = false; p.PairT = 0; }
                m.PartnerId = 0;
            }
            return gain;
        }
        private void KillPair(Monster a, Monster b, bool crit)
        {
            a.Removed = b.Removed = true; a.PartnerId = b.PartnerId = 0; a.PairPending = b.PairPending = false;
            AddCombo(2, crit); int gain = MathEx.Round((crit ? 1000 : 700) * Multiplier); S.Score += gain;
            Emit(CueKind.Pair, a, crit, (crit ? "双生暴击" : "双生击破") + "  +" + gain);
            Emit(CueKind.Hit, b, crit); Heal();
        }
        private void PairSolo(Monster m)
        {
            var p = Find(m.PartnerId); m.PairPending = false; m.PartnerId = 0;
            if (p != null) { p.PartnerId = 0; p.PairPending = false; p.PairT = 0; }
            int gain = Kill(m, m.PairCrit);
            // A twin's self-destruction deals damage but does not reset combo/FEVER.
            if (p != null && !p.Removed)
            { p.Removed = true; S.Hp = Math.Max(0, S.Hp - 20); Emit(CueKind.Hurt, p, false, "单破 +" + gain + " · 另一只自爆 -20"); CheckOver(); }
        }
        private void CheckOver()
        {
            if (S.Hp > 0 || S.Phase == Phase.Over) return;
            CancelHold(); S.Phase = Phase.Over; S.Burning = false; S.BurnCarry = 0;
            // Native presentation is always derived from phase + state, including game over.
            EndFever(); Notice("本轮结束");
        }
        private bool ResolveLane(Lane lane)
        {
            Monster target = null; double best = double.PositiveInfinity;
            foreach (var m in S.Monsters)
            {
                if (m.Removed || m.Kind != MonsterKind.Twin || !m.PairPending || m.PartnerId == 0) continue;
                var p = Find(m.PartnerId); if (p == null || p.Removed || p.Lane != lane) continue;
                double d = Math.Abs(p.X - S.Layout.HitX);
                if (d <= S.Layout.ZoneHalf && d < best) { best = d; target = p; }
            }
            if (target != null) { var p = Find(target.PartnerId); KillPair(p, target, p.PairCrit && best <= S.Layout.CritHalf); return true; }
            foreach (var m in S.Monsters)
            {
                if (m.Removed || m.Kind == MonsterKind.Hold || m.Lane != lane) continue;
                double d = Math.Abs(m.X - S.Layout.HitX);
                if (d <= S.Layout.ZoneHalf && d < best) { best = d; target = m; }
            }
            if (target == null) return false;
            bool crit = best <= S.Layout.CritHalf;
            if (target.Kind == MonsterKind.Twin && target.PartnerId != 0)
            {
                if (target.PairPending) return true; // No window refresh or repeated healing.
                target.PairPending = true; target.PairT = PairWindow; target.PairCrit = crit;
                Emit(CueKind.Hit, target, crit, "双生 · 请击打另一轨"); Heal();
            }
            else Kill(target, crit);
            return true;
        }
        public void Press(Lane lane, string input)
        {
            if (S.Phase != Phase.Running) return;
            var h = LongInLane(lane);
            if (h != null)
            {
                if (S.HoldId != 0 || h.Escaped) return;
                if (h.Anchored) { StartHold(h, input); return; }
                if (h.HeadX < S.Layout.HitX - S.Layout.ZoneHalf) { LongPenalty(h, "漏掉了"); return; }
                if (h.HeadX > S.Layout.HitX + S.Layout.ZoneHalf)
                { if (S.Now - h.TipT > .6) { h.TipT = S.Now; Notice("太早 · 等头部进入判定框"); } return; }
                StartHold(h, input); return;
            }
            if (S.HoldId != 0)
            { ResolveLane(lane); Cues.Add(new Cue(CueKind.Soul, S.Layout.HitX, S.Layout.Y(lane), lane)); return; }
            Strike(lane); ResolveLane(lane);
        }
        private void Strike(Lane lane)
        {
            if (S.AttackT <= AttackDuration * .42 || S.AttackLane != lane) { S.AttackT = AttackDuration; S.AttackLane = lane; }
            S.AirT = lane == Lane.Top ? (S.PlayerLane == Lane.Top ? S.AirT : 1) : 0;
            S.PlayerLane = lane;
            Cues.Add(new Cue(CueKind.Swing, S.Layout.HitX, S.Layout.Y(lane), lane));
        }
        // Chart timing supplies the target; all rewards and character mechanics remain shared.
        public void PressChart(Lane lane, Monster target, bool critical, string input = "chart")
        {
            if(S.Phase!=Phase.Running)return;
            if (S.HoldId != 0)
            {
                var held = Find(S.HoldId); if (held != null && held.Lane == lane) return;
                Cues.Add(new Cue(CueKind.Soul, S.Layout.HitX, S.Layout.Y(lane), lane));
            }
            else Strike(lane);
            if (target == null || target.Removed || target.Lane != lane) return;
            if (target.Kind == MonsterKind.Hold) StartHold(target, input, target.HoldDuration);
            else if (target.Kind == MonsterKind.Twin && target.PartnerId != 0)
            {
                var mate = Find(target.PartnerId);
                if (mate != null && mate.PairPending) KillPair(mate, target, critical && mate.PairCrit);
                else if (!target.PairPending)
                { target.PairPending = true; target.PairT = PairWindow; target.PairCrit = critical; Emit(CueKind.Hit, target, critical, "双生 · 请击打另一轨"); Heal(); }
            }
            else Kill(target,critical);
        }
        public void TickChartHold(Monster target, double progress)
        {
            if (S.Phase != Phase.Running || target.Removed || !target.Holding) return;
            target.HoldT = MathEx.Clamp(progress, 0, target.HoldDuration);
            if (!target.MidAwarded && target.HoldT >= target.HoldDuration / 2)
            { target.MidAwarded = true; Award(target, "长按中段"); }
        }
        public void CompleteChartHold(Monster target)
        { if (S.Phase == Phase.Running && target != null && !target.Removed) { TickChartHold(target, target.HoldDuration); CompleteLong(target); } }
        public void FailChartTwin(Monster target)
        { if (S.Phase == Phase.Running && target != null && !target.Removed && target.PairPending) PairSolo(target); }
        public void FailChartHold(Monster target)
        { if (target != null && !target.Removed) { LongPenalty(target, "长按时长不足"); target.Removed = true; } }
        public void MissChart(Monster target)
        {
            if(S.Phase!=Phase.Running||target==null||target.Removed)return;
            if (target.Kind == MonsterKind.Hold) FailChartHold(target); else Breach(target);
        }
        private void Breach(Monster m)
        {
            bool collides = m.PartnerId != 0 || S.PlayerLane == m.Lane;
            var mate = Find(m.PartnerId);
            if (mate != null && !mate.Removed) { mate.Removed = true; mate.PartnerId = 0; m.PartnerId = 0; Emit(CueKind.Miss, mate); }
            m.Removed = true; BreakCombo();
            if (collides) { S.Hp = Math.Max(0, S.Hp - 20); Emit(CueKind.Hurt, m, false, "-20"); CheckOver(); }
            else Emit(CueKind.Miss, m, false, "错过 · COMBO 清零");
        }
        private void Award(Monster m, string label)
        { int gain = MathEx.Round(200 * Multiplier); S.Score += gain; Emit(CueKind.Hold, m, false, label + " +" + gain); Heal(); }
        private void StartHold(Monster m, string input, double duration = 2)
        {
            S.HoldId = m.Id; S.HoldInput = input; S.AttackT = AttackDuration;
            S.AttackLane = S.PlayerLane = m.Lane; S.AirT = 0;
            m.Holding = m.Anchored = true; m.WaitT = 6;
            if (!m.HeadAwarded) { m.HeadAwarded = true; Award(m, "长按头部"); }
            Notice(duration == 2 ? "长按中 · 保持 2 秒 / 另一轨可灵魂出击" : "长按中 · 保持 " + duration.ToString("F2") + " 秒 / 另一轨可灵魂出击");
        }
        public void Release(string input)
        { if (S.Phase == Phase.Running && S.HoldId != 0 && S.HoldInput == input) LongPenalty(Find(S.HoldId), "长按不足 2 秒"); }
        public void CancelHold()
        { var h = Find(S.HoldId); if (h != null) h.Holding = false; S.HoldId = 0; S.HoldInput = null; }
        public void Pause() { if (S.Phase == Phase.Running) { CancelHold(); S.Phase = Phase.Paused; } }
        public void Resume() { if (S.Phase == Phase.Paused) S.Phase = Phase.Running; }
        private void LongPenalty(Monster h, string text)
        {
            if (h == null || h.Removed || h.Escaped) return;
            S.HoldId = 0; S.HoldInput = null; BreakCombo();
            h.Holding = h.Anchored = false; h.Escaped = true; h.EscapeSpeed = 980;
            Emit(CueKind.Miss, h, false, text + " · COMBO 清零");
        }
        private void CompleteLong(Monster h)
        {
            S.HoldId = 0; S.HoldInput = null; h.Removed = true; h.Anchored = h.Holding = false;
            AddCombo(1, false); Award(h, "长按贯穿");
        }
        private bool ActivePair()
        { foreach (var m in S.Monsters) if (!m.Removed && m.Kind == MonsterKind.Twin && m.PartnerId != 0) { var p = Find(m.PartnerId); if (p != null && !p.Removed) return true; } return false; }
        private bool ActiveLong()
        { foreach (var m in S.Monsters) if (!m.Removed && m.Kind == MonsterKind.Hold) return true; return false; }
        private Lane? EmptyLane()
        {
            bool top = false, bottom = false;
            foreach (var m in S.Monsters) if (!m.Removed) { if (m.Lane == Lane.Top) top = true; else bottom = true; }
            if (!top && !bottom) return Rng.Next() < .5 ? Lane.Top : Lane.Bottom;
            if (!top) return Lane.Top; if (!bottom) return Lane.Bottom; return null;
        }
        public Monster SpawnLong(Lane lane)
        {
            var l = S.Layout; double len = MathEx.Clamp(l.Width * .26, 180, 300);
            var m = new Monster { Kind = MonsterKind.Hold, Id = S.NextId++, Lane = lane, X = l.Width + 30, Y = l.Y(lane),
                Len = len, W = len, H = MathEx.Clamp(l.Height * .1, 26, 44), Phase = Rng.Range(0, Math.PI * 2) };
            S.Monsters.Add(m);
            if (!S.LongHintShown) { S.LongHintShown = true; Notice("长按敌人 · 头部进框后按住 2 秒"); } return m;
        }
        public void SpawnPair()
        {
            var l = S.Layout; double sf = MathEx.Clamp(l.Width / 900, .8, 1.9) * Rng.Range(.97, 1.03);
            double phase = Rng.Range(0, Math.PI * 2); int pair = ++S.PairSeq, id = S.NextId;
            for (int i = 0; i < 2; i++)
            {
                var lane = i == 0 ? Lane.Top : Lane.Bottom;
                S.Monsters.Add(new Monster { Kind = MonsterKind.Twin, Id = S.NextId++, Lane = lane, X = l.Width + 60, Y = l.Y(lane),
                    Vx = -Speed * sf, Sf = sf, W = MathEx.Clamp(l.Width * .055, 40, 62), H = MathEx.Clamp(l.Height * .17, 40, 78),
                    Phase = phase, Wob = Rng.Range(.8, 1.6), PairId = pair, PartnerId = i == 0 ? id + 1 : id });
            }
            if (!S.PairHintShown) { S.PairHintShown = true; Notice("双生敌人 · 0.18 秒内击破上下两轨"); }
        }
        public Monster SpawnNormal(Lane lane)
        {
            var l = S.Layout; double sf = MathEx.Clamp(l.Width / 900, .8, 1.9) * Rng.Range(.97, 1.03);
            var m = new Monster { Kind = MonsterKind.Normal, Id = S.NextId++, Lane = lane, X = l.Width + 60,
                Y = l.Y(lane) + Rng.Range(-6, 6), Vx = -Speed * sf, Sf = sf,
                W = MathEx.Clamp(l.Width * .055, 40, 62), H = MathEx.Clamp(l.Height * .17, 40, 78),
                Phase = Rng.Range(0, Math.PI * 2), Wob = Rng.Range(.8, 1.6) };
            S.Monsters.Add(m); return m;
        }
        private void Spawn()
        {
            if (S.Now > 8 && S.LongCooldown <= 0 && !ActiveLong() && !ActivePair())
            { var lane = EmptyLane(); if (lane.HasValue && Rng.Next() < .28) { SpawnLong(lane.Value); S.LongCooldown = Rng.Range(14, 18); return; } }
            if (!ActiveLong() && !ActivePair() && S.Now > 6 && S.PairCooldown <= 0 && Rng.Next() < .2)
            { SpawnPair(); S.PairCooldown = Rng.Range(5, 8); return; }
            var normalLane = Rng.Next() < .5 ? Lane.Top : Lane.Bottom;
            if (LongInLane(normalLane) != null) { normalLane = normalLane == Lane.Top ? Lane.Bottom : Lane.Top; if (LongInLane(normalLane) != null) return; }
            SpawnNormal(normalLane);
        }
        public void Resize(Layout layout)
        {
            S.Layout = layout;
            foreach (var m in S.Monsters)
            {
                m.Y = layout.Y(m.Lane);
                if (m.Kind == MonsterKind.Hold) { m.Len = m.W = MathEx.Clamp(layout.Width * .26, 180, 300); m.H = MathEx.Clamp(layout.Height * .1, 26, 44); }
                else { m.W = MathEx.Clamp(layout.Width * .055, 40, 62); m.H = MathEx.Clamp(layout.Height * .17, 40, 78); }
            }
        }
        public void Tick(double dt) { TickInternal(dt,false); }
        public void TickChart(double dt) { TickInternal(dt,true); }
        private void TickInternal(double dt,bool chartDriven)
        {
            double step = Math.Min(Math.Max(dt, 0), .05);
            if (S.Phase != Phase.Running) { if (S.Phase != Phase.Paused) S.AttackT = Math.Max(0, S.AttackT - step); return; }
            S.Now += step; S.Monsters.RemoveAll(m => m.Removed); S.SpawnTimer -= step;
            if (!chartDriven && S.SpawnTimer <= 0)
            { Spawn(); S.SpawnTimer = MathEx.Clamp(1.28 - Math.Min(S.Now * .075, 10) * .045 + Rng.Range(-.12, .16), .62, 1.45) / SpawnMultiplier(S.Difficulty); }
            if (S.PairCooldown > 0) S.PairCooldown -= step;
            if (S.LongCooldown > 0) S.LongCooldown -= step;
            breached.Clear(); expired.Clear(); double reachX = S.Layout.PlayerX + S.Layout.PlayerR * 1.15 + 8;
            foreach (var m in S.Monsters)
            {
                if(chartDriven)continue;
                if (m.Kind == MonsterKind.Hold)
                {
                    if (m.Escaped) { m.X -= m.EscapeSpeed * step; m.Removed = m.X + m.Len < -60; }
                    else if (!m.Anchored) { m.X -= Speed * .8 * step; if (m.HeadX < S.Layout.HitX - S.Layout.ZoneHalf) LongPenalty(m, "漏掉了"); }
                }
                else { m.Vx = -Speed * m.Sf; m.X += m.Vx * step; m.Phase += step * m.Wob * 4; if (m.X - m.W / 2 <= reachX) breached.Add(m.Id); }
            }
            foreach (var m in S.Monsters)
            {
                if (chartDriven) continue; // Chart holds use their recorded duration and song clock.
                if (m.Kind != MonsterKind.Hold || m.Removed || m.Escaped || !m.Anchored) continue;
                if (S.HoldId == m.Id)
                {
                    m.HoldT = Math.Min(m.HoldT + step, 2);
                    if (!m.MidAwarded && m.HoldT >= 1) { m.MidAwarded = true; Award(m, "1 秒"); }
                    if (m.HoldT >= 2) { CompleteLong(m); break; }
                }
                else { m.WaitT -= step; if (m.WaitT <= 0) { LongPenalty(m, "长按不足 2 秒"); break; } }
            }
            foreach (var m in S.Monsters) if (!chartDriven && m.Kind == MonsterKind.Twin && !m.Removed && m.PairPending) { m.PairT -= step; if (m.PairT <= 0) expired.Add(m.Id); }
            foreach (var id in expired) { var m = Find(id); if (m != null && !m.Removed) PairSolo(m); if (S.Phase != Phase.Running) break; }
            if (S.PlayerLane == Lane.Top && S.HoldId == 0) { S.AirT = Math.Max(0, S.AirT - step); if (S.AirT <= 0) S.PlayerLane = Lane.Bottom; }
            foreach (var id in breached)
            {
                if (S.Phase != Phase.Running) break;
                var m = Find(id); if (m == null || m.Removed) continue;
                Breach(m);
            }
            if (S.Fever) { S.FeverT -= step; if (S.FeverT <= 0) EndFever(); }
            if (S.Burning)
            {
                if (S.Hp <= 125) { S.Burning = false; S.BurnCarry = 0; Notice("燃魂结束"); }
                else
                {
                    double carry = S.BurnCarry + step * 12.5; int drain = (int)Math.Floor(carry + 1e-9);
                    S.Hp = Math.Max(125, S.Hp - drain); S.BurnCarry = S.Hp <= 125 ? 0 : carry - drain;
                    if (S.Hp <= 125) { S.Burning = false; Notice("燃魂结束"); }
                }
            }
            S.AttackT = Math.Max(0, S.AttackT - step);
        }
    }
}
