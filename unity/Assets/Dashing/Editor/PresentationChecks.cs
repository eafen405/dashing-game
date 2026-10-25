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
            g.Press(Lane.Top,"jump");m.Tick(s,0);check(!m.Riding&&m.Airborne,"Top attack leaves ground riding");
            s.AirT=.5;m.Tick(s,.016f);check(Math.Abs(m.Y-s.Layout.Y(Lane.Top))<.001,"Parabolic jump apex touches upper rail at 0.5 seconds");
            float apex=m.Y;g.Press(Lane.Bottom,"interrupt");m.Tick(s,.016f);
            check(m.Y>apex&&m.Y<s.Layout.Y(Lane.Bottom)&&m.Airborne,"Interrupted jump starts gravity fall without teleporting");
            for(int i=0;i<70&&m.Airborne;i++)m.Tick(s,.016f);
            check(!m.Airborne&&m.Landing>0&&m.Squash>0,"Touchdown produces landing compression");
            s.AttackT=0;for(int i=0;i<20;i++)m.Tick(s,.016f);check(m.Riding,"Ground riding resumes after landing");
            var h=g.SpawnLong(Lane.Bottom);h.X=s.Layout.HitX-h.H*.46;g.Press(Lane.Bottom,"hold");m.Tick(s,.016f);
            check(m.HoldActive&&m.Holding&&!m.Riding,"Hold uses hovering swing pose");
            g.Pause();m.Tick(s,.016f);check(m.HoldActive&&!m.Holding,"Paused anchored hold preserves waiting pose");g.Resume();
            g.CancelHold();s.Monsters.Clear();s.AttackT=0;m.Cue(new Cue(CueKind.Pair,0,0,Lane.Bottom),s);m.Tick(s,.3f);
            check(m.PairP>.16f&&m.PairP<.58f&&m.BodyY<m.Y-s.Layout.PlayerR*2,"Twin finish has the source 0.62 second jump / slam");
            float pair=m.PairP;s.Phase=Phase.Paused;m.Tick(s,.2f);check(m.PairP==pair,"Pause freezes twin pose");s.Phase=Phase.Running;
            m.Reset(s);s.HoldId=99;m.Cue(new Cue(CueKind.Pair,0,0,Lane.Top),s);m.Tick(s,.016f);check(m.PairP==0,"Soul twin finish never makes held body jump");s.HoldId=0;
            m.Cue(new Cue(CueKind.Hurt,0,0,Lane.Bottom),s);m.Tick(s,.016f);check(m.Hurt>0,"Hurt flash starts");m.Tick(s,.3f);check(m.Hurt==0,"Hurt flash clears");
            s.Fever=true;m.Tick(s,.35f);check(m.Fever==1,"FEVER halo follows rule state");s.Fever=false;m.Tick(s,.35f);check(m.Fever==0,"FEVER halo fully clears after 0.35 seconds");
            m.Reset(s);s.AttackT=0;s.AirT=0;s.PlayerLane=Lane.Bottom;s.Phase=Phase.Over;m.Tick(s,.016f);check(!m.Riding,"Game over stops ground riding");
            log.AppendLine("DASHING_PRESENTATION_CHECKS_PASS "+count+" assertions");return log.ToString();
        }
    }
}
