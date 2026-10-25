using System;
using System.Collections.Generic;

namespace Dashing.Core
{
    public enum Lane { Top, Bottom }
    public enum Phase { Menu, Running, Paused, Over }
    public enum Character { Zhe, Rin }
    public enum MonsterKind { Normal, Twin, Hold }
    public enum CueKind { Hit, Swing, Soul, Hurt, Miss, Pair, Hold, Notice, FeverStart, FeverEnd }

    public struct Cue
    {
        public CueKind Kind;
        public double X, Y;
        public Lane Lane;
        public bool Critical;
        public string Text;
        public Cue(CueKind kind, double x, double y, Lane lane, bool critical = false, string text = "")
        { Kind = kind; X = x; Y = y; Lane = lane; Critical = critical; Text = text; }
    }

    // Rule coordinates deliberately use the web version's pixels (Y points down).
    // Only the presentation layer converts them to Unity world coordinates.
    public sealed class Layout
    {
        public double Width, Height, PlayerR, PlayerX, HitX, HitW, ZoneHalf, CritHalf;
        public double Y(Lane lane) { return Height * (lane == Lane.Top ? .28 : .72); }
        public Layout(double width = 1280, double height = 720)
        {
            Width = width; Height = height;
            PlayerR = MathEx.Clamp(height * .115, 22, 46);
            PlayerX = Math.Max(MathEx.Clamp(width * .085, 48, 120), PlayerR * 2.05 + 12);
            HitW = MathEx.Clamp(width * .07, 58, 100);
            ZoneHalf = HitW * .5 + MathEx.Clamp(width * .03, 16, 44);
            CritHalf = ZoneHalf * .5;
            HitX = PlayerX + PlayerR * 3.07;
        }
    }

    public static class MathEx
    {
        public static double Clamp(double x, double a, double b) { return Math.Max(a, Math.Min(b, x)); }
        // JavaScript Math.round, including the positive midpoint convention.
        public static int Round(double x) { return (int)Math.Floor(x + .5); }
    }

    public sealed class Mulberry32
    {
        private uint state;
        public Mulberry32(uint seed) { state = seed; }
        public double Next()
        {
            unchecked
            {
                state += 0x6d2b79f5u;
                uint t = (state ^ (state >> 15)) * (1u | state);
                t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
        public double Range(double a, double b) { return a + Next() * (b - a); }
    }

    public sealed class Monster
    {
        public int Id, PartnerId, PairId;
        public MonsterKind Kind;
        public Lane Lane;
        public double X, Y, W, H, Vx, Sf, Phase, Wob, PairT;
        public bool Removed, PairPending, PairCrit;
        public double Len, HoldT, WaitT = 6, TipT = -9, EscapeSpeed = 980;
        public bool Anchored, Escaped, Holding, HeadAwarded, MidAwarded;
        public double HeadX { get { return X + H * .46; } }
    }

    public sealed class GameState
    {
        public Phase Phase = Phase.Running;
        public Character Character;
        public uint Seed;
        public int Difficulty, MaxHp, Hp, Score, Combo, MaxCombo, Kills, CritCount, NormalCount;
        public Layout Layout;
        public double Now, BurnCarry, SpawnTimer = 1.3, FeverT, PairCooldown = 4.5, LongCooldown = 6;
        public bool Burning, Fever, PairHintShown, LongHintShown;
        public int NextFeverAt = 50, PairSeq, HoldId, NextId = 1;
        public string HoldInput;
        public double AttackT, AirT;
        public Lane? AttackLane;
        public Lane PlayerLane = Lane.Bottom;
        public readonly List<Monster> Monsters = new List<Monster>(32);
    }
}
