using System.Collections.Generic;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    // Native sprites are reused. No per-frame GameObjects, textures or materials.
    public sealed class Stage
    {
        private readonly Transform root;
        private readonly List<SpriteRenderer> scenery=new List<SpriteRenderer>();
        private readonly List<EnemyView> enemies=new List<EnemyView>();
        private readonly List<SpriteRenderer> stars=new List<SpriteRenderer>();
        private readonly SpriteRenderer[] rails=new SpriteRenderer[2];
        private readonly HitZoneView[] zones=new HitZoneView[2];
        private readonly SpriteRenderer floor, slash;
        private readonly PlayerMotion motion=new PlayerMotion();
        private readonly CharacterEffects characterEffects;
        public PlayerMotion Motion {get {return motion;}}
        public RinView Rin {get {return rin;}}
        public bool FeverEffectsVisible {get {return characterEffects.FeverVisible;}}
        public void SetRinQuality(bool refined){rin.Refined=soul.Refined=refined;}
        private readonly RinView rin, soul;
        private readonly Transform zhe;
        private readonly SpriteRenderer head, hair, torso, leg1, leg2, arm, bat, cap;
        private readonly Particle[] sparks=new Particle[160];
        private readonly SpriteRenderer[] rings=new SpriteRenderer[16];
        private readonly float[] ringLife=new float[16];
        private readonly Vector3[] ringOrigin=new Vector3[16];
        private int sparkIndex,ringIndex;
        private float swingT,soulT=-1,visualClock,scroll,playerY;
        private Lane swingLane,soulLane;
        private readonly System.Random random=new System.Random(870);
        public Stage(Transform parent)
        {
            Art.Init();root=new GameObject("Native 2D battlefield").transform;root.SetParent(parent,false);
            for(int i=0;i<64;i++) stars.Add(Art.Part("Star",root,Art.Disc,new Color(.45f,.65f,1,.16f),-15));
            floor=Art.Part("Ground",root,Art.Square,new Color(.035f,.085f,.09f),-10);
            for(int i=0;i<2;i++)
            {
                var lane=(Lane)i;
                rails[i]=Art.Part("Rail "+lane,root,Art.Square,Art.LaneColor(lane)*new Color(1,1,1,.42f),-1);
                zones[i]=new HitZoneView(root,lane);
            }
            for(int i=0;i<50;i++) scenery.Add(Art.Part("Scrolling ground",root,Art.Square,new Color(.12f,.24f,.24f,.5f),-8));
            characterEffects=new CharacterEffects(root);
            rin=new RinView(root,"Rin native animation",10); soul=new RinView(root,"Soul proxy",12);soul.Root.SetActive(false);
            zhe=new GameObject("Zhe native character").transform;zhe.SetParent(root,false);
            leg1=Art.Part("Leg L",zhe,Art.Square,new Color(.17f,.2f,.35f),6);leg2=Art.Part("Leg R",zhe,Art.Square,new Color(.17f,.2f,.35f),6);
            torso=Art.Part("Jersey",zhe,Art.Disc,new Color(.9f,.2f,.28f),7);
            head=Art.Part("Head",zhe,Art.Disc,new Color(1,.8f,.66f),8);
            hair=Art.Part("Hair",zhe,Art.Disc,new Color(.16f,.17f,.27f),9);
            cap=Art.Part("Baseball cap",zhe,Art.Square,Art.Sky,10);
            arm=Art.Part("Arm",zhe,Art.Square,new Color(1,.8f,.66f),9);
            bat=Art.Part("Baseball bat",zhe,Art.Square,new Color(1,.76f,.45f),10);
            slash=Art.Part("Attack arc",root,Art.Ring,Color.white,15);slash.enabled=false;
            for(int i=0;i<sparks.Length;i++) {sparks[i]=new Particle {Sprite=Art.Part("Hit spark",root,Art.Disc,Color.white,18)};sparks[i].Sprite.enabled=false;}
            for(int i=0;i<rings.Length;i++) {rings[i]=Art.Part("Impact ring",root,Art.Ring,Color.white,16);rings[i].enabled=false;}
        }
        public void Reset(GameState s)
        { motion.Reset(s);playerY=motion.Y;visualClock=scroll=swingT=0;soulT=-1;foreach(var p in sparks){p.Life=0;p.Sprite.enabled=false;} for(int i=0;i<rings.Length;i++){ringLife[i]=0;rings[i].enabled=false;} }
        public void Cue(Cue cue,GameState s)
        {
            motion.Cue(cue,s);
            if(cue.Kind==CueKind.Swing) {swingT=.22f;swingLane=cue.Lane;}
            if(cue.Kind==CueKind.Soul) {soulT=0;soulLane=cue.Lane;}
            if(cue.Kind==CueKind.Hit || cue.Kind==CueKind.Pair || cue.Kind==CueKind.Hurt || cue.Kind==CueKind.Hold || cue.Kind==CueKind.Miss)
            {
                Color color=cue.Kind==CueKind.Hurt?new Color(1,.2f,.4f):cue.Kind==CueKind.Pair?Art.Purple:cue.Kind==CueKind.Hold?Art.Mint:cue.Critical?Art.Gold:Art.LaneColor(cue.Lane);
                Burst(cue.X,cue.Y,color,cue.Critical?22:14);
                int r=ringIndex++%rings.Length;ringLife[r]=.42f;ringOrigin[r]=Art.At(cue.X,cue.Y);rings[r].color=color;rings[r].enabled=true;
            }
        }
        private void Burst(double x,double y,Color c,int count)
        {
            for(int i=0;i<count;i++)
            {
                var p=sparks[sparkIndex++%sparks.Length];double a=random.NextDouble()*System.Math.PI*2;float speed=(float)(.8+random.NextDouble()*3.2);
                p.Position=Art.At(x,y);p.Velocity=new Vector3((float)System.Math.Cos(a)*speed,(float)System.Math.Sin(a)*speed,0);
                p.Life=p.MaxLife=(float)(.18+random.NextDouble()*.3);p.Color=c;p.Sprite.enabled=true;p.Sprite.transform.localScale=Vector3.one*(float)(.02+random.NextDouble()*.04);
            }
        }
        public void Draw(GameState s,float dt)
        {
            var l=s.Layout;bool animate=s.Phase!=Phase.Paused;
            if(animate) {visualClock+=dt;scroll+=(float)(dt*(s.Phase==Phase.Running?165:38));swingT=Mathf.Max(0,swingT-dt);if(soulT>=0)soulT+=dt;}
            motion.Tick(s,dt);playerY=motion.BodyY;
            Art.Place(floor,l.Width/2,(l.Y(Lane.Bottom)+l.PlayerR*.94+l.Height)/2,l.Width,l.Height-l.Y(Lane.Bottom)-l.PlayerR*.94);
            for(int i=0;i<stars.Count;i++)
            {float x=(float)((i*197.37-scroll*.025)%l.Width);if(x<0)x+=(float)l.Width;float y=(float)((i*79.13)%(l.Height*.76));Art.Place(stars[i],x,y,i%9==0?3:1.5,i%9==0?3:1.5);}
            for(int i=0;i<scenery.Count;i++)
            {float x=(float)((i*89.3-scroll)%l.Width);if(x<0)x+=(float)l.Width;float y=(float)(l.Y(Lane.Bottom)+l.PlayerR+8+(i*23.17)%(l.Height*.2));Art.Place(scenery[i],x,y,4+i%5*2,1+i%3);}
            for(int i=0;i<2;i++)
            {
                var lane=(Lane)i;Color c=s.Fever?Art.Gold:Art.LaneColor(lane);
                rails[i].color=new Color(c.r,c.g,c.b,.35f);
                Art.Place(rails[i],l.Width/2,l.Y(lane)+l.PlayerR*.94,l.Width,1.5);
                zones[i].Draw(s,visualClock);
            }
            rin.Root.SetActive(s.Character==Character.Rin);zhe.gameObject.SetActive(s.Character==Character.Zhe);
            if(s.Character==Character.Rin) rin.Draw(s,visualClock,playerY,motion);else DrawZhe(s);
            characterEffects.Draw(s,motion);
            soul.Root.SetActive(soulT>=0 && soulT<.5f && s.Character==Character.Rin);
            if(soul.Root.activeSelf)soul.Draw(s,visualClock,playerY,motion,true,soulT,soulLane);
            slash.enabled=swingT>0 || (soulT>=0&&soulT<.2);
            if(slash.enabled){Lane lane=swingT>0?swingLane:soulLane;slash.color=new Color(1,.9f,.6f,Mathf.Clamp01(swingT/.22f));Art.Place(slash,l.HitX,l.Y(lane),l.ZoneHalf*1.4,l.ZoneHalf*.7,-25);}
            int used=0;
            foreach(var m in s.Monsters)
            {
                if(m.Removed)continue;
                if(used>=enemies.Count)enemies.Add(new EnemyView(root));
                enemies[used++].Draw(m,s,visualClock);
            }
            for(int i=used;i<enemies.Count;i++)enemies[i].Root.gameObject.SetActive(false);
            for(int i=0;i<sparks.Length;i++)
            {
                var p=sparks[i];if(p.Life<=0)continue;if(animate){p.Life-=dt;p.Position+=p.Velocity*dt;p.Velocity+=Vector3.down*dt*2;}
                p.Sprite.enabled=p.Life>0;p.Sprite.transform.localPosition=p.Position;p.Sprite.color=new Color(p.Color.r,p.Color.g,p.Color.b,Mathf.Max(0,p.Life/p.MaxLife));
            }
            for(int i=0;i<rings.Length;i++)
            {
                if(ringLife[i]<=0)continue;if(animate)ringLife[i]-=dt;rings[i].enabled=ringLife[i]>0;rings[i].transform.localPosition=ringOrigin[i];
                rings[i].transform.localScale=Vector3.one*Mathf.Lerp(.15f,1.6f,1-ringLife[i]/.42f);Color c=rings[i].color;c.a=Mathf.Max(0,ringLife[i]/.42f);rings[i].color=c;
            }
        }
        private void DrawZhe(GameState s)
        {
            float r=(float)s.Layout.PlayerR;
            zhe.localPosition=Art.At(s.Layout.PlayerX,playerY);
            float stretch=1+motion.Squash*.05f;zhe.localScale=new Vector3(1/stretch,stretch,1);
            zhe.localRotation=Quaternion.Euler(0,0,-motion.Tilt*Mathf.Rad2Deg);
            float attack=s.AttackT>0?(float)System.Math.Sin((1-s.AttackT/Game.AttackDuration)*System.Math.PI):0;
            Art.Place(torso,0,0,r*.9,r*1.15);Art.Place(head,0,-r*.68,r*.76,r*.76);Art.Place(hair,-r*.04,-r*.89,r*.85,r*.4);
            Art.Place(cap,r*.08,-r*.91,r*.95,r*.14,-5);
            float step=motion.Walking?Mathf.Sin(visualClock*13)*15:0,tuck=motion.Airborne||motion.HoldActive?25:0;
            Art.Place(leg1,-r*.18,r*.63,r*.23,r*.65,step-tuck);Art.Place(leg2,r*.18,r*.63,r*.23,r*.65,-step+tuck);
            Art.Place(arm,r*.35,-r*.05,r*.2,r*.75,30-attack*90);
            // The bat tip reaches the exact same hit center as the rule geometry.
            Art.Place(bat,r*(.75+attack*.85),-r*(.5-attack*.55),r*.15,r*2.55,-35-attack*55);
        }
        private sealed class Particle {public SpriteRenderer Sprite;public float Life,MaxLife;public Vector3 Position,Velocity;public Color Color;}
        private sealed class EnemyView
        {
            public readonly Transform Root;
            private readonly SpriteRenderer body,eyeL,eyeR,browL,browR,hornL,hornR,fill,outline;
            private readonly LineRenderer chain;
            public EnemyView(Transform parent)
            {
                Root=new GameObject("Pooled enemy").transform;Root.SetParent(parent,false);
                chain=Root.gameObject.AddComponent<LineRenderer>();chain.sharedMaterial=Art.SpriteMaterial;chain.positionCount=2;chain.useWorldSpace=false;chain.startWidth=chain.endWidth=.018f;chain.sortingOrder=3;
                outline=Art.Part("Outline",Root,Art.Disc,new Color(1,1,1,.15f),4);
                body=Art.Part("Body",Root,Art.Disc,Color.white,5);fill=Art.Part("Hold progress",Root,Art.Square,Art.Gold,6);
                eyeL=Art.Part("Eye L",Root,Art.Disc,Color.white,7);eyeR=Art.Part("Eye R",Root,Art.Disc,Color.white,7);
                browL=Art.Part("Brow L",Root,Art.Square,new Color(.08f,.1f,.2f),8);browR=Art.Part("Brow R",Root,Art.Square,new Color(.08f,.1f,.2f),8);
                hornL=Art.Part("Horn L",Root,Art.Triangle,Color.white,4);hornR=Art.Part("Horn R",Root,Art.Triangle,Color.white,4);
            }
            public void Draw(Monster m,GameState s,float clock)
            {
                Root.gameObject.SetActive(true);float bob=m.Kind==MonsterKind.Hold?0:Mathf.Sin((float)m.Phase)*3;
                Root.localPosition=Art.At(m.X,m.Y+bob);
                Color color=m.Kind==MonsterKind.Hold?Art.Mint:m.Kind==MonsterKind.Twin?Art.Purple:Art.LaneColor(m.Lane);
                if(m.PairPending)color=Color.Lerp(color,Color.white,.65f);if(m.Escaped)color=new Color(.3f,.38f,.45f,.6f);
                body.color=color;outline.color=new Color(color.r,color.g,color.b,.22f);hornL.color=hornR.color=color;
                bool hold=m.Kind==MonsterKind.Hold;double center=hold?m.Len/2:0;
                Art.Place(body,center,0,m.W,m.H);Art.Place(outline,center,0,m.W+9,m.H+9);
                double face=hold?m.H*.52:0;
                Art.Place(eyeL,face-m.H*.15,-m.H*.06,m.H*.13,m.H*.19);Art.Place(eyeR,face+m.H*.12,-m.H*.06,m.H*.13,m.H*.19);
                Art.Place(browL,face-m.H*.16,-m.H*.18,m.H*.22,m.H*.07,-20);Art.Place(browR,face+m.H*.12,-m.H*.18,m.H*.22,m.H*.07,20);
                hornL.enabled=hornR.enabled=!hold;Art.Place(hornL,-m.W*.3,-m.H*.43,m.W*.3,m.H*.32,20);Art.Place(hornR,m.W*.3,-m.H*.43,m.W*.3,m.H*.32,-20);
                fill.enabled=hold;if(hold)Art.Place(fill,m.Len*m.HoldT/4,m.H*.27,m.Len*m.HoldT/2,4);
                chain.enabled=m.Kind==MonsterKind.Twin&&m.PartnerId!=0&&m.Lane==Lane.Top;
                if(chain.enabled){chain.startColor=chain.endColor=new Color(.78f,.57f,1,.45f);chain.SetPosition(0,Vector3.zero);chain.SetPosition(1,Art.At(0,s.Layout.Y(Lane.Bottom)-m.Y));}
            }
        }
    }
}
