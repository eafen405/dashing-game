using System;
using System.IO;
using System.Text;
using Dashing.Core;
using UnityEngine;

namespace Dashing.Editor
{
    public static class RuleChecks
    {
        private static int checks;
        private static readonly StringBuilder log=new StringBuilder();
        private static void Check(bool ok,string name){checks++;if(!ok)throw new Exception("RULE_CHECK_FAILED: "+name);log.AppendLine("PASS "+name);}
        private static Game Fresh(Character c=Character.Rin,int d=3){var g=new Game(12345,d,c);g.S.SpawnTimer=999;return g;}
        private static Monster AtHit(Game g,Lane lane=Lane.Bottom){var m=g.SpawnNormal(lane);m.X=g.S.Layout.HitX;return m;}
        public static string Run()
        {
            checks=0;log.Clear();var rng=new Mulberry32(12345);
            Check(Math.Abs(rng.Next()-.9797282677609473)<1e-15,"Mulberry32 first draw matches JavaScript");
            var g=Fresh();Check(g.S.Hp==125&&g.S.MaxHp==250,"Rin initial HP");
            var z=Fresh(Character.Zhe);Check(z.S.Hp==300&&z.S.MaxHp==300,"Zhe initial HP");
            AtHit(g);g.Press(Lane.Bottom,"a");Check(g.S.Score==300&&g.S.Hp==130&&g.S.Combo==1&&g.S.CritCount==1,"Critical score and heal");
            var m=AtHit(g);m.X+=g.S.Layout.CritHalf+1;g.Press(Lane.Bottom,"b");Check(g.S.Score==500&&g.S.NormalCount==1,"Normal outer zone score");
            int hp=g.S.Hp,combo=g.S.Combo;g.Press(Lane.Top,"empty");Check(g.S.Hp==hp&&g.S.Combo==combo,"Empty swing has no penalty");
            double air=g.S.AirT;g.Tick(.05);g.Press(Lane.Top,"repeat");Check(g.S.AirT<air,"Repeated top press does not renew airtime");
            g=Fresh();g.SpawnPair();var a=g.S.Monsters[0];var b=g.S.Monsters[1];a.X=b.X=g.S.Layout.HitX;
            g.Press(Lane.Top,"a");double window=a.PairT;int healed=g.S.Hp;g.Press(Lane.Top,"repeat");
            Check(a.PairT==window&&g.S.Hp==healed,"Pending twin repeat neither refreshes nor heals");
            g.Press(Lane.Bottom,"b");Check(g.S.Score==1000&&g.S.Combo==2&&g.S.Kills==2&&g.S.Hp==135,"Twin double critical and exactly two heals");
            g=Fresh();g.SpawnPair();a=g.S.Monsters[0];b=g.S.Monsters[1];a.X=b.X=g.S.Layout.HitX;
            g.Press(Lane.Top,"a");for(int i=0;i<4;i++)g.Tick(.05);
            Check(g.S.Score==300&&g.S.Hp==115&&g.S.Combo==1,"Twin timeout score, explosion, second kill heal");
            g=Fresh();var h=g.SpawnLong(Lane.Bottom);h.X=g.S.Layout.HitX-h.H*.46;g.Press(Lane.Bottom,"hold");
            Check(g.S.Score==200&&g.S.Combo==0&&g.S.HoldId==h.Id,"Hold head scores without combo");
            g.Release("wrong");Check(g.S.HoldId==h.Id,"Only initiating input can release hold");
            AtHit(g,Lane.Top);double attackT=g.S.AttackT;g.Press(Lane.Top,"soul");
            Check(g.S.HoldId==h.Id&&g.S.PlayerLane==Lane.Bottom&&g.S.AttackT==attackT&&g.S.Score==500,"Soul strike preserves body and hold");
            for(int i=0;i<41;i++)g.Tick(.05);
            Check(g.S.HoldId==0&&h.Removed&&g.S.Score==900&&g.S.Combo==2&&g.S.NormalCount==1,"Hold head/mid/tail total and completion combo");
            g=Fresh();h=g.SpawnLong(Lane.Top);h.X=g.S.Layout.HitX-h.H*.46;g.Press(Lane.Top,"h");g.Tick(.05);g.Pause();double now=g.S.Now;
            g.Tick(.05);Check(g.S.Now==now&&g.S.HoldId==0&&h.Anchored&&!h.Escaped,"Pause freezes and safely anchors hold");
            g.Resume();g.Press(Lane.Top,"resume");Check(g.S.HoldId==h.Id&&g.S.Score==200,"Resume hold does not award head twice");
            g.Release("resume");Check(h.Escaped&&g.S.Hp==130&&g.S.Combo==0,"Early hold release clears combo without HP damage");
            int count=g.S.Monsters.Count;g.Press(Lane.Top,"blocked");Check(g.S.Monsters.Count==count&&g.S.HoldId==0,"Escaped hold continues blocking input");
            g=Fresh();g.S.Hp=245;AtHit(g);g.Press(Lane.Bottom,"burn");Check(g.S.Burning&&g.S.Hp==250&&g.S.Score==300,"Burn starts after triggering hit is scored");
            AtHit(g);g.Press(Lane.Bottom,"next");Check(g.S.Score==900,"Burn scores next hit x2");
            for(int i=0;i<201;i++)g.Tick(.05);Check(!g.S.Burning&&g.S.Hp==125,"Burn drains to floor");
            g.S.Burning=true;g.S.Hp=100;g.Tick(.05);Check(g.S.Hp==100&&!g.S.Burning,"Burn never heals damage up to floor");
            for(int d=1;d<=4;d++)
            {
                g=Fresh(Character.Zhe,d);g.S.Combo=49;AtHit(g);g.Press(Lane.Bottom,"fever");
                Check(g.S.Fever&&g.S.Score==450,"Difficulty "+d+": threshold hit receives FEVER bonus");
                g.S.FeverT=.01;g.Tick(.02);Check(!g.S.Fever&&g.S.FeverT==0,"Difficulty "+d+": natural FEVER cleanup");
                g.S.Fever=true;g.S.FeverT=10;m=AtHit(g);m.X=0;g.Tick(.01);
                Check(!g.S.Fever&&g.S.Combo==0&&g.S.Hp==280,"Difficulty "+d+": collision ends FEVER");
                g.S.Fever=true;g.S.FeverT=10;m=AtHit(g,Lane.Top);m.X=0;g.S.PlayerLane=Lane.Bottom;g.Tick(.01);
                Check(!g.S.Fever&&g.S.Hp==280,"Difficulty "+d+": other lane miss ends FEVER without damage");
                g.S.Fever=true;g.S.FeverT=10;h=g.SpawnLong(Lane.Bottom);h.X=g.S.Layout.HitX-h.H*.46;g.Press(Lane.Bottom,"h");g.Release("h");
                Check(!g.S.Fever&&g.S.FeverT==0,"Difficulty "+d+": hold failure ends FEVER");
            }
            g=Fresh();g.Pause();g.Tick(1);Check(g.S.Now==0,"Paused clock is frozen");g.Resume();g.Tick(1);Check(g.S.Now==.05,"Tick caps simulation delta at .05");
            g=Fresh();g.Resize(new Layout(1920,1080));AtHit(g);g.Press(Lane.Bottom,"wide");Check(g.S.Score==300,"Resized hit geometry remains aligned");
            Check(Resources.Load<Texture2D>("Rin/atk-11")!=null&&Resources.Load<Texture2D>("Rin/ride-8")!=null,"Rin assets are imported");
            Check(Resources.Load<Shader>("Shaders/RinBlend")!=null,"Native blended-frame shader is included");
            if(File.Exists("TestResults/reference.json"))VerifyReference();
            log.AppendLine("DASHING_RULE_CHECKS_PASS: "+checks+" checks");return log.ToString();
        }
        [Serializable]private sealed class Fixture {public Replay[] cases;}
        [Serializable]private sealed class Replay {public int seed,difficulty,character;public Step[] steps;}
        [Serializable]private sealed class Step {public int type,lane;public string input;public double dt;public bool verify;public Snapshot expected;}
        [Serializable]private sealed class Snapshot
        {public int hp,score,combo,kills,crit,normal,maxCombo,holdId,nextId;public bool fever,burning;public double now,feverT,spawnTimer,pairCooldown,longCooldown,airT,attackT,burnCarry;public int playerLane;public Enemy[] monsters;}
        [Serializable]private sealed class Enemy {public int id,kind,lane,partner;public double x,y,sf,phase,pairT,holdT,waitT;public bool removed,pending,escaped,anchored;}
        private static void VerifyReference()
        {
            var fixture=JsonUtility.FromJson<Fixture>(File.ReadAllText("TestResults/reference.json"));int snapshots=0;
            foreach(var replay in fixture.cases)
            {
                var g=new Game((uint)replay.seed,replay.difficulty,(Character)replay.character);
                foreach(var step in replay.steps)
                {
                    switch(step.type){case 0:g.Tick(step.dt);break;case 1:g.Press((Lane)step.lane,step.input);break;case 2:g.Release(step.input);break;case 3:g.Pause();break;case 4:g.Resume();break;}
                    if(!step.verify)continue;var e=step.expected;var s=g.S;
                    string label="reference d="+replay.difficulty+" c="+replay.character+" t="+s.Now;
                    Check(s.Hp==e.hp&&s.Score==e.score&&s.Combo==e.combo&&s.Kills==e.kills&&s.CritCount==e.crit&&s.NormalCount==e.normal&&s.MaxCombo==e.maxCombo&&s.HoldId==e.holdId&&s.NextId==e.nextId&&s.Fever==e.fever&&s.Burning==e.burning&&s.PlayerLane==(Lane)e.playerLane,label+" counters");
                    Check(Near(s.Now,e.now)&&Near(s.FeverT,e.feverT)&&Near(s.SpawnTimer,e.spawnTimer)&&Near(s.PairCooldown,e.pairCooldown)&&Near(s.LongCooldown,e.longCooldown)&&Near(s.AirT,e.airT)&&Near(s.AttackT,e.attackT)&&Near(s.BurnCarry,e.burnCarry),label+" clocks");
                    Check(s.Monsters.Count==e.monsters.Length,label+" population");
                    for(int i=0;i<s.Monsters.Count;i++)
                    {var m=s.Monsters[i];var n=e.monsters[i];Check(m.Id==n.id&&(int)m.Kind==n.kind&&(int)m.Lane==n.lane&&m.PartnerId==n.partner&&Near(m.X,n.x)&&Near(m.Y,n.y)&&Near(m.Sf,n.sf)&&Near(m.Phase,n.phase)&&Near(m.PairT,n.pairT)&&Near(m.HoldT,n.holdT)&&Near(m.WaitT,n.waitT)&&m.Removed==n.removed&&m.PairPending==n.pending&&m.Escaped==n.escaped&&m.Anchored==n.anchored,label+" enemy "+m.Id);}
                    snapshots++;
                }
            }
            log.AppendLine("Matched "+snapshots+" TypeScript reference snapshots across "+fixture.cases.Length+" replays.");
        }
        private static bool Near(double a,double b){return Math.Abs(a-b)<1e-8;}
    }
}
