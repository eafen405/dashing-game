using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    public static class Art
    {
        public static readonly Color Sky = new Color(.22f,.73f,1);
        public static readonly Color Ground = new Color(1,.48f,.27f);
        public static readonly Color Gold = new Color(1,.81f,.35f);
        public static readonly Color Mint = new Color(.4f,1,.77f);
        public static readonly Color Purple = new Color(.78f,.57f,1);
        public static Sprite Square, Disc, Ring, Triangle, Glow;
        public static Material SpriteMaterial;
        public static Color LaneColor(Lane lane) { return lane == Lane.Top ? Sky : Ground; }
        public static Vector3 At(double x, double y) { return new Vector3((float)x / 100, -(float)y / 100, 0); }
        public static void Init()
        {
            if (Square != null) return;
            Square = Make(4, (x,y) => Color.white);
            Disc = Make(128, (x,y) => new Color(1,1,1,Mathf.Clamp01((1-Mathf.Sqrt(x*x+y*y))*64)));
            Glow = Make(128, (x,y) => new Color(1,1,1,Mathf.Pow(Mathf.Clamp01(1-Mathf.Sqrt(x*x+y*y)),2)));
            Ring = Make(128, (x,y) => new Color(1,1,1,Mathf.Clamp01((.055f-Mathf.Abs(Mathf.Sqrt(x*x+y*y)-.93f))*64)));
            Triangle = Make(64, (x,y) => new Color(1,1,1,y >= -1 && y <= 1 && Mathf.Abs(x) <= (1-y)*.5f ? 1 : 0));
            SpriteMaterial = new Material(Shader.Find("Sprites/Default"));
        }
        private static Sprite Make(int size, System.Func<float,float,Color> pixel)
        {
            var t = new Texture2D(size,size,TextureFormat.RGBA32,false); t.name="Dashing procedural shape";
            var colors = new Color[size*size];
            for(int y=0;y<size;y++) for(int x=0;x<size;x++) colors[y*size+x]=pixel((x+.5f)/size*2-1,(y+.5f)/size*2-1);
            t.SetPixels(colors); t.Apply(); t.wrapMode=TextureWrapMode.Clamp; t.filterMode=FilterMode.Bilinear;
            return Sprite.Create(t,new Rect(0,0,size,size),new Vector2(.5f,.5f),size);
        }
        public static SpriteRenderer Part(string name, Transform parent, Sprite sprite, Color color, int order)
        {
            var go = new GameObject(name); go.transform.SetParent(parent,false);
            var s=go.AddComponent<SpriteRenderer>(); s.sprite=sprite; s.color=color; s.sortingOrder=order; return s;
        }
        public static void Place(SpriteRenderer part, double x, double y, double w, double h, float angle=0)
        { part.transform.localPosition=At(x,y); part.transform.localScale=new Vector3((float)w/100,(float)h/100,1); part.transform.localRotation=Quaternion.Euler(0,0,angle); }
    }

    public sealed class RinView
    {
        private static readonly int[] Idle={0,1,2,3,2,1}, Ride={0,1,2,3,4,5,6,7,8}, Attack={0,1,2,3,4,5,6,7,8,9,10,11}, Burn={1,2,3,4,5,6,7,8,9,10,11};
        private const float Padding=24;
        private static readonly Vector2[] StandingUV=TexCoords(550,343),RidingUV=TexCoords(410,285);
        private static readonly int[] Triangles={0,2,1,1,2,3};
        private static readonly Vector3[] StandingQuad=Vertices(550,343,.559f,.994f),RidingQuad=Vertices(410,285,.5488f,.975f);
        private readonly Texture2D[] idle=new Texture2D[5], attack=new Texture2D[12], ride=new Texture2D[9];
        private readonly Texture2D[] refinedIdle=new Texture2D[5],refinedAttack=new Texture2D[12],refinedRide=new Texture2D[9];
        private readonly Texture2D[,] idleMotion=new Texture2D[4,4],rideMotion=new Texture2D[9,9];
        public bool Refined {get;set;}=true;
        public bool UsingMotion {get;private set;}
        public readonly GameObject Root;
        private readonly Material material;
        private readonly Mesh mesh;
        private readonly Transform frameRoot;
        public bool IsRiding { get { return riding; } }
        public int FrameFrom { get; private set; }
        public int FrameTo { get; private set; }
        public float FrameMix { get; private set; }
        public string Pose { get; private set; }
        private bool riding;
        public RinView(Transform parent, string name, int order)
        {
            Root=new GameObject(name); Root.transform.SetParent(parent,false);
            for(int i=0;i<idle.Length;i++) idle[i]=Resources.Load<Texture2D>("Rin/idle-"+i);
            for(int i=0;i<attack.Length;i++) attack[i]=Resources.Load<Texture2D>("Rin/atk-"+i);
            for(int i=0;i<ride.Length;i++) ride[i]=Resources.Load<Texture2D>("Rin/ride-"+i);
            for(int i=0;i<refinedIdle.Length;i++)refinedIdle[i]=Resources.Load<Texture2D>("RinRefined/idle-"+i);
            for(int i=0;i<refinedAttack.Length;i++)refinedAttack[i]=Resources.Load<Texture2D>("RinRefined/atk-"+i);
            for(int i=0;i<refinedRide.Length;i++)refinedRide[i]=Resources.Load<Texture2D>("RinRefined/ride-"+i);
            for(int i=0;i<3;i++)
            {
                idleMotion[i,i+1]=Resources.Load<Texture2D>("RinMotion/idle-"+i+"-"+(i+1));
                idleMotion[i+1,i]=Resources.Load<Texture2D>("RinMotion/idle-"+(i+1)+"-"+i);
            }
            for(int i=0;i<9;i++)
            {
                int next=(i+1)%9;rideMotion[i,next]=Resources.Load<Texture2D>("RinMotion/ride-"+i+"-"+next);
                rideMotion[next,i]=Resources.Load<Texture2D>("RinMotion/ride-"+next+"-"+i);
            }
            frameRoot=new GameObject("Blended frame").transform;frameRoot.SetParent(Root.transform,false);
            mesh=new Mesh {name="Rin animated quad"}; frameRoot.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
            material=new Material(Resources.Load<Shader>("Shaders/RinBlend"));
            var renderer=frameRoot.gameObject.AddComponent<MeshRenderer>(); renderer.sharedMaterial=material; renderer.sortingOrder=order;
            Quad(false);
            mesh.triangles=Triangles;
        }
        private static Vector3[] Vertices(float w,float h,float ax,float ay)
        {
            float l=(-w*ax-Padding)/100,r=(w*(1-ax)+Padding)/100,b=(-h*(1-ay)-Padding)/100,t=(h*ay+Padding)/100;
            return new[]{new Vector3(l,b,0),new Vector3(r,b,0),new Vector3(l,t,0),new Vector3(r,t,0)};
        }
        private static Vector2[] TexCoords(float w,float h)
        {
            float x=Padding/w,y=Padding/h;
            return new[]{new Vector2(-x,-y),new Vector2(1+x,-y),new Vector2(-x,1+y),new Vector2(1+x,1+y)};
        }
        private void Quad(bool isRide)
        {
            riding=isRide;mesh.vertices=isRide?RidingQuad:StandingQuad;mesh.uv=isRide?RidingUV:StandingUV;mesh.RecalculateBounds();
        }
        public void Draw(GameState s, double clock, double playerY, PlayerMotion motion, bool soul=false, double soulT=0, Lane soulLane=Lane.Top)
        {
            bool hold=motion.HoldActive && !soul;
            bool striking=soul || s.AttackT>0;
            bool pair=!soul&&motion.PairP>0;
            bool isRide=!soul&&motion.Riding;
            if(isRide!=riding) Quad(isRide);
            int[] frames; Texture2D[] textures; double position; bool loop; double blend;
            if(striking) {Pose=soul?"soul":"attack";frames=s.Burning?Burn:Attack;textures=attack;position=(soul?soulT/.5:1-s.AttackT/Game.AttackDuration)*frames.Length;loop=false;blend=.35;}
            else if(hold) {Pose=motion.Holding?"hold":"hold-wait";frames=Attack;textures=attack;position=motion.Holding?((clock+.13)% .24)/.24*12:2;loop=motion.Holding;blend=.35;}
            else if(pair) {Pose="pair";double t=motion.PairP;frames=Attack;textures=attack;position=t<.16?1+t/.16:t<.58?2:t<.8?2+(t-.58)/.22*5:7+(t-.8)/.2*4;loop=false;blend=.35;}
            else if(isRide) {Pose="ride";frames=Ride;textures=ride;position=clock*12;loop=true;blend=1;}
            else {Pose="idle";frames=Idle;textures=idle;position=clock*4;loop=true;blend=1;}
            double p=loop?position%frames.Length:MathEx.Clamp(position,0,frames.Length-1);
            int index=(int)p; int from=frames[index],to=frames[loop?(index+1)%frames.Length:System.Math.Min(index+1,frames.Length-1)];
            float mix=(float)MathEx.Clamp((p-index-(1-blend))/blend,0,1);mix=mix*mix*(3-2*mix);
            FrameFrom=from;FrameTo=to;FrameMix=mix;
            bool idlePose=textures==idle,ridePose=textures==ride;
            Texture2D flowA=idlePose?idleMotion[from,to]:ridePose?rideMotion[from,to]:null;
            Texture2D flowB=idlePose?idleMotion[to,from]:ridePose?rideMotion[to,from]:null;
            UsingMotion=Refined&&flowA!=null&&flowB!=null;
            material.SetFloat("_Motion",UsingMotion?1:0);
            if(UsingMotion)
            {
                material.SetTexture("_FlowA",flowA);material.SetTexture("_FlowB",flowB);
                material.SetVector("_FlowScale",new Vector4(32f/(ridePose?410:550),-32f/(ridePose?285:343),0,0));
            }
            if(Refined)textures=idlePose?refinedIdle:ridePose?refinedRide:refinedAttack;
            material.SetTexture("_MainTex",textures[from]);material.SetTexture("_NextTex",textures[to]);material.SetFloat("_Mix",mix);
            Color tint=soul?new Color(.55f,.86f,1,.6f*(1-(float)soulT/.5f)):Color.Lerp(Color.white,new Color(1,.2f,.3f),motion.Hurt/.24f*.75f);
            material.SetColor("_Color",tint);
            material.SetColor("_Glow",s.Burning&&s.Phase!=Phase.Over?new Color(1,.08f,.2f,.45f):Color.clear);
            double feet=s.Layout.PlayerR*(.94-(isRide?.08:0));
            float scale=(float)(s.Layout.PlayerR*2.06/(isRide?195:281));
            float stretch=soul?1:1+motion.Squash*.05f;
            Root.transform.localPosition=Art.At(s.Layout.PlayerX,soul?s.Layout.Y(soulLane):playerY);
            Root.transform.localRotation=Quaternion.Euler(0,0,soul?0:-motion.Tilt*Mathf.Rad2Deg);
            Root.transform.localScale=new Vector3((striking||hold||pair?-1:1)/stretch,stretch,1);
            frameRoot.localPosition=Art.At(0,feet);frameRoot.localScale=new Vector3(scale,scale,1);
        }
    }
}
