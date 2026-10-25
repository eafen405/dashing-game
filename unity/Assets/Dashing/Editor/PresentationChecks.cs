using System;
using System.Text;
using Dashing.Core;
using Dashing.Unity;

namespace Dashing.Editor
{
    public static class PresentationChecks
    {
        public static string Run()
        {
            var log=new StringBuilder();int count=0;
            Action<bool,string> check=(ok,name)=>{if(!ok)throw new Exception("PRESENTATION_CHECK_FAILED: "+name);count++;log.AppendLine("PASS "+name);};
            var g=new Game(12345,3,Character.Rin);g.S.SpawnTimer=999;var s=g.S;
            var m=new PlayerMotion();m.Reset(s);m.Tick(s,.016f);
            check(m.Riding&&m.Walking,"Rin runs on the ground using the riding pose");
            s.Phase=Phase.Menu;m.Tick(s,.016f);check(!m.Riding,"Menu uses standing breathing");
            s.Phase=Phase.Running;m.Tick(s,.016f);float clock=m.Clock,y=m.BodyY;
            g.Pause();m.Tick(s,.2f);check(m.Riding&&m.Clock==clock&&m.BodyY==y,"Paused ground pose and visual clock stay frozen");g.Resume();
            g.Press(Lane.Top,"jump");ApplyCues(g,m);m.Tick(s,0);check(!m.Riding&&m.Airborne,"Top attack leaves ground riding");
            check(Math.Abs(m.Y-s.Layout.Y(Lane.Top))<.001,"Top input reaches upper rail without advancing animation time");
            s.AirT=.5;m.Tick(s,.016f);check(m.Y>s.Layout.Y(Lane.Top)&&m.Y<s.Layout.Y(Lane.Bottom),"Idle upper attack begins a gradual descent");
            g.Press(Lane.Bottom,"interrupt");ApplyCues(g,m);m.Tick(s,0);
            check(Math.Abs(m.Y-s.Layout.Y(Lane.Bottom))<.001&&!m.Airborne,"Bottom input interrupts airtime and reaches lower rail immediately");
            check(!m.Airborne&&m.Landing>0&&m.Squash>0,"Touchdown produces landing compression");
            s.AttackT=0;for(int i=0;i<20;i++)m.Tick(s,.016f);check(m.Riding,"Ground riding resumes after landing");
            var h=g.SpawnLong(Lane.Bottom);h.X=s.Layout.HitX-h.H*.46;g.Press(Lane.Bottom,"hold");ApplyCues(g,m);m.Tick(s,.016f);
            check(m.HoldActive&&m.Holding&&!m.Riding,"Hold uses hovering swing pose");
            g.Pause();m.Tick(s,.016f);check(m.HoldActive&&!m.Holding,"Paused anchored hold preserves waiting pose");g.Resume();
            g.CancelHold();s.Monsters.Clear();s.AttackT=0;m.Cue(new Cue(CueKind.Pair,0,0,Lane.Bottom),s);m.Tick(s,.3f);
            check(m.PairP>.16f&&m.PairP<.58f&&m.BodyY<m.Y-s.Layout.PlayerR*2,"Twin finish has the source 0.62 second jump / slam");
            float pair=m.PairP;s.Phase=Phase.Paused;m.Tick(s,.2f);check(m.PairP==pair,"Pause freezes twin pose");s.Phase=Phase.Running;
            g.Press(Lane.Top,"interrupt-pair");foreach(var cue in g.Cues)m.Cue(cue,s);g.Cues.Clear();m.Tick(s,0);
            check(m.PairP==0&&Math.Abs(m.BodyY-s.Layout.Y(Lane.Top))<s.Layout.PlayerR*.15,"New strike interrupts twin finish and puts body on the requested rail");
            m.Reset(s);s.HoldId=99;m.Cue(new Cue(CueKind.Pair,0,0,Lane.Top),s);m.Tick(s,.016f);check(m.PairP==0,"Soul twin finish never makes held body jump");s.HoldId=0;
            m.Cue(new Cue(CueKind.Hurt,0,0,Lane.Bottom),s);m.Tick(s,.016f);check(m.Hurt>0,"Hurt flash starts");m.Tick(s,.3f);check(m.Hurt==0,"Hurt flash clears");
            s.Fever=true;m.Tick(s,.35f);check(m.Fever==1,"FEVER halo follows rule state");s.Fever=false;m.Tick(s,.35f);check(m.Fever==0,"FEVER halo fully clears after 0.35 seconds");
            m.Reset(s);s.AttackT=0;s.AirT=0;s.PlayerLane=Lane.Bottom;s.Phase=Phase.Over;m.Tick(s,.016f);check(!m.Riding,"Game over stops ground riding");
            CheckRailResponse(check);
            log.AppendLine("DASHING_PRESENTATION_CHECKS_PASS "+count+" assertions");return log.ToString();
        }
        private static void CheckRailResponse(Action<bool,string> check)
        {
            foreach(Character character in new[]{Character.Rin,Character.Zhe})
            {
                foreach(float dt in new[]{0f,.001f,1f/240,1f/60,1f/30,.05f})
                {
                    var game=new Game(12345,1,character);game.S.SpawnTimer=999;
                    var motion=new PlayerMotion();motion.Reset(game.S);
                    bool aligned=true;
                    for(int i=0;i<100;i++)
                    {
                        Lane rail=i%2==0?Lane.Top:Lane.Bottom;game.Press(rail,"rapid");
                        ApplyCues(game,motion);motion.Tick(game.S,dt);
                        aligned&=Math.Abs(motion.Y-game.S.Layout.Y(rail))<.001&&
                            Math.Abs(motion.BodyY-game.S.Layout.Y(rail))<game.S.Layout.PlayerR*.15;
                    }
                    check(aligned,character+" follows 100 alternating inputs without travel lag at dt="+dt);
                }
                var chart=new MusicChart{title="Rail response",duration=10};
                chart.notes.Add(new RhythmNote(1,Lane.Top));chart.notes.Add(new RhythmNote(1.001,Lane.Bottom));
                var battle=new RhythmBattle(chart,character);var view=new PlayerMotion();view.Reset(battle.State);
                battle.Advance(1);var upper=battle.Press(Lane.Top,1);ApplyCues(battle.Combat,view);view.Tick(battle.State,0);
                check(upper.judgment==RhythmJudgment.Perfect&&Math.Abs(view.Y-battle.State.Layout.Y(Lane.Top))<.001,character+" chart hit and upper-rail visual agree in the input frame");
                battle.Advance(1.001);var lower=battle.Press(Lane.Bottom,1.001);ApplyCues(battle.Combat,view);view.Tick(battle.State,0);
                check(lower.judgment==RhythmJudgment.Perfect&&Math.Abs(view.Y-battle.State.Layout.Y(Lane.Bottom))<.001,character+" chart can reverse rails one millisecond later");
                var holdGame=new Game(12345,1,character);var holdMotion=new PlayerMotion();holdMotion.Reset(holdGame.S);
                var hold=holdGame.SpawnLong(Lane.Top);hold.X=holdGame.S.Layout.HitX-hold.H*.46;
                holdGame.Press(Lane.Top,"hold");holdMotion.Tick(holdGame.S,0);float heldY=holdMotion.Y;
                holdGame.Press(Lane.Bottom,"soul");foreach(var cue in holdGame.Cues)holdMotion.Cue(cue,holdGame.S);holdMotion.Tick(holdGame.S,0);
                check(holdMotion.Holding&&holdMotion.Y==heldY&&holdGame.S.PlayerLane==Lane.Top,character+" soul strike preserves held body despite immediate rail presentation");
                holdGame.Pause();float before=holdMotion.BodyY;holdMotion.Tick(holdGame.S,.05f);
                check(holdMotion.BodyY==before,character+" pause freezes fast rail presentation");
                CheckDescent(character,check);
            }
        }
        private static void ApplyCues(Game game,PlayerMotion motion)
        {foreach(var cue in game.Cues)motion.Cue(cue,game.S);game.Cues.Clear();}
        private static void CheckDescent(Character character,Action<bool,string> check)
        {
            foreach(float dt in new[]{1f/240,1f/60,1f/30,.05f})
            {
                var game=new Game(12345,1,character);game.S.SpawnTimer=999;var s=game.S;
                var motion=new PlayerMotion();motion.Reset(s);
                game.Press(Lane.Top,"up");ApplyCues(game,motion);motion.Tick(s,0);
                float top=(float)s.Layout.Y(Lane.Top),bottom=(float)s.Layout.Y(Lane.Bottom),previous=motion.Y;
                int steps=(int)Math.Round(.5/dt);bool continuous=true;
                for(int i=0;i<steps;i++)
                {game.Tick(dt);ApplyCues(game,motion);motion.Tick(s,dt);continuous&=motion.Y>=previous&&motion.Y<bottom&&motion.Airborne;previous=motion.Y;}
                check(continuous&&Math.Abs(motion.Y-(top+(bottom-top)*.25f))<.1f,character+" idle fall accelerates continuously to quarter height after 500 ms at dt="+dt);
                float pausedY=motion.Y,pausedBody=motion.BodyY;game.Pause();motion.Tick(s,.5f);
                check(motion.Y==pausedY&&motion.BodyY==pausedBody,character+" pause freezes descent at dt="+dt);game.Resume();
                for(int i=0;i<steps+1;i++){game.Tick(dt);ApplyCues(game,motion);motion.Tick(s,dt);}
                check(Math.Abs(motion.Y-bottom)<.001&&!motion.Airborne&&motion.Landing>0,character+" idle fall lands around one second at dt="+dt);
                game.Press(Lane.Top,"up-again");ApplyCues(game,motion);motion.Tick(s,0);motion.Tick(s,.35f);
                game.Press(Lane.Top,"repeat-up");ApplyCues(game,motion);motion.Tick(s,0);
                check(Math.Abs(motion.Y-top)<.001,character+" upper strike interrupts descent even when the rule rail is already Top");
                motion.Tick(s,.2f);game.Press(Lane.Bottom,"down");ApplyCues(game,motion);motion.Tick(s,0);
                check(Math.Abs(motion.Y-bottom)<.001&&!motion.Airborne,character+" lower strike interrupts descent immediately");
            }
            var chart=new MusicChart{title="Natural descent",duration=10};chart.notes.Add(new RhythmNote(1,Lane.Top));
            var battle=new RhythmBattle(chart,character);var view=new PlayerMotion();view.Reset(battle.State);
            battle.Advance(1);battle.Press(Lane.Top,1);ApplyCues(battle.Combat,view);view.Tick(battle.State,0);
            battle.Advance(1.5);ApplyCues(battle.Combat,view);view.Tick(battle.State,.5f);
            check(view.Y>battle.State.Layout.Y(Lane.Top)&&view.Y<battle.State.Layout.Y(Lane.Bottom)&&view.Airborne,character+" custom chart upper strike also descends without another input");
        }
    }
}
