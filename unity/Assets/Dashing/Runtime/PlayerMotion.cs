using System;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    // Presentation only: rule coordinates and attack / airtime clocks stay in Core.
    // Timings and pose curves follow src/battlefield/pixi/player.ts.
    public sealed class PlayerMotion
    {
        public float Clock { get; private set; }
        public float Y { get; private set; }
        public float BodyY { get; private set; }
        public float Landing { get; private set; }
        public float PairP { get; private set; }
        public float Squash { get; private set; }
        public float Tilt { get; private set; }
        public float Hurt { get; private set; }
        public float Fever { get; private set; }
        public bool Airborne { get; private set; }
        public bool Riding { get; private set; }
        public bool HoldActive { get; private set; }
        public bool Holding { get; private set; }
        public bool Walking { get; private set; }
        private float fallV, pairLeft;

        public void Reset(GameState s)
        {
            Clock=Landing=PairP=Squash=Tilt=Hurt=Fever=fallV=pairLeft=0;
            Y=BodyY=(float)s.Layout.Y(Lane.Bottom);
            Airborne=Riding=HoldActive=Holding=Walking=false;
        }
        public void Cue(Cue cue, GameState s)
        {
            // A soul's twin kill must not pull the held body out of its lane.
            if(cue.Kind==CueKind.Pair && s.HoldId==0)pairLeft=.62f;
            if(cue.Kind==CueKind.Hurt)Hurt=.24f;
        }
        public void Tick(GameState s,float dt)
        {
            if(s.Phase==Phase.Paused)dt=0;
            Clock+=dt;Landing=Mathf.Max(0,Landing-dt);Hurt=Mathf.Max(0,Hurt-dt);
            pairLeft=Mathf.Max(0,pairLeft-dt);PairP=pairLeft>0?1-pairLeft/.62f:0;
            Fever=Mathf.MoveTowards(Fever,s.Fever&&s.Phase!=Phase.Over?1:0,dt/.35f);
            HoldActive=Holding=false;
            foreach(var m in s.Monsters)
                if(m.Kind==MonsterKind.Hold && m.Anchored && !m.Removed && !m.Escaped && m.Lane==s.PlayerLane)
                {HoldActive=true;Holding=m.Holding&&s.HoldId==m.Id;break;}
            float bottom=(float)s.Layout.Y(Lane.Bottom),top=(float)s.Layout.Y(Lane.Top),r=(float)s.Layout.PlayerR;
            bool jumping=s.AirT>0 && !HoldActive, falling=false;
            if(jumping)
            {
                float p=1-(float)MathEx.Clamp(s.AirT,0,1);
                Y=bottom-(bottom-top)*4*p*(1-p);fallV=0;
            }
            else if(!HoldActive && s.PlayerLane==Lane.Bottom && Y<bottom-.5f)
            {
                // An interrupted top attack falls with gravity rather than teleporting.
                fallV+=2400*dt;Y=Mathf.Min(bottom,Y+fallV*dt);falling=Y<bottom-.5f;
            }
            else
            {
                Y=Mathf.Lerp(Y,(float)s.Layout.Y(s.PlayerLane),1-Mathf.Exp(-11*dt));fallV=0;
            }
            bool airborneNow=jumping||falling;
            if(Airborne&&!airborneNow&&s.PlayerLane==Lane.Bottom)Landing=.18f;
            Airborne=airborneNow;
            Walking=(s.Phase==Phase.Running||s.Phase==Phase.Paused) && s.AttackT<=0 && !HoldActive && PairP==0 &&
                s.PlayerLane==Lane.Bottom && !Airborne && Mathf.Abs(Y-bottom)<1.5f;
            Riding=Walking&&s.Character==Character.Rin;
            float lift=0,hover=0;Squash=Tilt=0;
            if(PairP>0)
            {
                float p=PairP;
                if(p<.16f)Squash=Mathf.Sin(Mathf.PI*p/.16f)*.7f;
                else if(p<.58f)lift=-r*2.5f*Ease((p-.16f)/.42f);
                else if(p<.8f){float k=(p-.58f)/.22f;lift=-r*2.5f*(1-k*k*k);Tilt=.16f*k;}
                else Squash=1-Ease((p-.8f)/.2f);
            }
            else if(HoldActive){hover=-r*1.15f+Mathf.Sin(Clock*4.6f)*r*.05f;Tilt=.05f;}
            else if(s.AttackT>0)
            {
                float t=1-(float)(s.AttackT/Game.AttackDuration);
                if(s.AttackLane==Lane.Top){if(t<.18f)Squash=Mathf.Sin(Mathf.PI*t/.18f)*.55f;}
                else if(t<.2f)Squash=Mathf.Sin(Mathf.PI*t/.2f)*.25f;
                else if(t<.4f){Squash=Smooth((t-.2f)/.2f);Tilt=.13f*Squash;}
                else {Squash=1-Smooth((t-.4f)/.6f);Tilt=.13f*Squash;}
            }
            if(jumping)Tilt+=(s.AirT>.5?-.06f:.06f);
            else if(falling)Tilt+=.05f;
            if(Walking&&!HoldActive)Tilt+=.05f;
            if(Landing>0)Squash=Mathf.Max(Squash,Landing/.18f*.45f);
            float bob=Airborne?0:Riding?Mathf.Sin(Clock*2.6f)*r*.035f:
                Mathf.Sin(Clock*2.2f)*r*.03f+(Walking?Mathf.Abs(Mathf.Sin(Clock*13))*r*.035f:0);
            BodyY=Y+hover+lift+Squash*r*.1f+bob;
        }
        private static float Ease(float t){return 1-Mathf.Pow(1-Mathf.Clamp01(t),3);}
        private static float Smooth(float t){t=Mathf.Clamp01(t);return t<.5f?4*t*t*t:1-Mathf.Pow(-2*t+2,3)/2;}
    }
}
