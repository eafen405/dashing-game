using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    // Reusable mesh ribbons: no GameObjects / gradients / materials created in Draw.
    // A tapered, fading tail gives the source comet / scythe shapes their weight.
    public sealed class ArcRibbon
    {
        private const int Segments=64;
        private readonly Mesh mesh;
        private readonly MeshRenderer renderer;
        private readonly Vector3[] vertices=new Vector3[(Segments+1)*2];
        private readonly Color[] colors=new Color[(Segments+1)*2];
        public ArcRibbon(Transform parent,string name,int order)
        {
            var go=new GameObject(name);go.transform.SetParent(parent,false);
            mesh=new Mesh {name=name};mesh.MarkDynamic();
            var uv=new Vector2[vertices.Length];var triangles=new int[Segments*6];
            for(int i=0;i<=Segments;i++){uv[i*2]=new Vector2(0,.5f);uv[i*2+1]=new Vector2(1,.5f);}
            for(int i=0;i<Segments;i++){int v=i*2,t=i*6;triangles[t]=v;triangles[t+1]=v+2;triangles[t+2]=v+1;triangles[t+3]=v+1;triangles[t+4]=v+2;triangles[t+5]=v+3;}
            mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=triangles;
            go.AddComponent<MeshFilter>().sharedMesh=mesh;
            renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=Art.SpriteMaterial;renderer.sortingOrder=order;
        }
        public void Hide(){renderer.enabled=false;}
        public void Draw(float x,float y,float rx,float ry,float start,float sweep,float width,Color color,bool tail=false)
        {
            renderer.enabled=color.a>.001f&&Mathf.Abs(sweep)>.001f;
            if(!renderer.enabled)return;
            for(int i=0;i<=Segments;i++)
            {
                float t=(float)i/Segments,a=start+sweep*t,c=Mathf.Cos(a),s=Mathf.Sin(a);
                float w=width*.5f*(tail?.12f+.88f*t:1);
                vertices[i*2]=Art.At(x+c*(rx-w),y+s*(ry-w));
                vertices[i*2+1]=Art.At(x+c*(rx+w),y+s*(ry+w));
                Color tint=color;if(tail)tint.a*=t*t;
                colors[i*2]=colors[i*2+1]=tint;
            }
            mesh.vertices=vertices;mesh.colors=colors;mesh.RecalculateBounds();
        }
    }

    public sealed class CharacterEffects
    {
        private readonly SpriteRenderer shadow,groundGlow,burnGlow,feverGlow,land,pair;
        private readonly SpriteRenderer[] smoke=new SpriteRenderer[6],embers=new SpriteRenderer[5],hairGlow=new SpriteRenderer[2],hairFlame=new SpriteRenderer[6],dust=new SpriteRenderer[2];
        private readonly ArcRibbon hpTrack,hpValue;
        private readonly ArcRibbon[] feverSoft=new ArcRibbon[3],feverCore=new ArcRibbon[3],burnDark=new ArcRibbon[3],burnRed=new ArcRibbon[3],burnHot=new ArcRibbon[3],scythe=new ArcRibbon[3];
        public bool FeverVisible { get; private set; }
        public CharacterEffects(Transform parent)
        {
            shadow=Art.Part("Character ground shadow",parent,Art.Glow,Color.black,-4);
            groundGlow=Art.Part("Character ground light",parent,Art.Glow,Art.Mint,-3);
            burnGlow=Art.Part("Burn red-black radial glow",parent,Art.Glow,Color.red,1);
            feverGlow=Art.Part("FEVER radial light",parent,Art.Glow,Art.Gold,1);
            land=Art.Part("Landing dust ring",parent,Art.Ring,Color.white,13);
            pair=Art.Part("Twin slam ellipse",parent,Art.Ring,Color.white,13);
            hpTrack=new ArcRibbon(parent,"HP faint full track",13);hpValue=new ArcRibbon(parent,"HP remaining arc",14);
            for(int i=0;i<3;i++)
            {
                feverSoft[i]=new ArcRibbon(parent,"FEVER soft arc",2);feverCore[i]=new ArcRibbon(parent,"FEVER bright arc",3);
                burnDark[i]=new ArcRibbon(parent,"Burn dark comet",2);burnRed[i]=new ArcRibbon(parent,"Burn blood-red comet",3);burnHot[i]=new ArcRibbon(parent,"Burn leading edge",4);
                scythe[i]=new ArcRibbon(parent,"Scythe crescent trail",11);
            }
            for(int i=0;i<smoke.Length;i++)smoke[i]=Art.Part("Rising dark flame",parent,Art.Glow,Color.red,4);
            for(int i=0;i<embers.Length;i++)embers[i]=Art.Part("Floating ember",parent,Art.Disc,Art.Gold,12);
            for(int i=0;i<2;i++){hairGlow[i]=Art.Part("Burn hair tip glow",parent,Art.Glow,Color.red,11);dust[i]=Art.Part("Footfall dust",parent,Art.Glow,Color.white,-2);}
            for(int i=0;i<hairFlame.Length;i++)hairFlame[i]=Art.Part("Tapered hair flame",parent,Art.Triangle,Color.red,11);
        }
        public void Draw(GameState s,PlayerMotion motion)
        {
            float r=(float)s.Layout.PlayerR,x=(float)s.Layout.PlayerX,y=motion.BodyY,t=motion.Clock;
            float feet=(float)s.Layout.Y(Lane.Bottom)+r*.94f;
            float height=Mathf.Clamp01((feet-y-r*.94f)/(float)(s.Layout.Y(Lane.Bottom)-s.Layout.Y(Lane.Top)));
            shadow.color=new Color(0,0,0,.65f-height*.2f);Art.Place(shadow,x,feet,r*(1.6f-height*.65f),r*(.4f-height*.14f));
            Color lane=s.Burning?new Color(1,.08f,.2f):s.Fever?Art.Gold:Art.LaneColor(s.PlayerLane);
            groundGlow.color=Alpha(lane,.48f-height*.2f);Art.Place(groundGlow,x,feet,r*3.8f,r*.65f);
            float hp=Mathf.Clamp01((float)s.Hp/s.MaxHp),radius=r*1.95f;
            hpTrack.Draw(x,y,radius,radius,-Mathf.PI/2,Mathf.PI*2,1.2f,new Color(.7f,.85f,.9f,.12f));
            Color health=s.Burning?new Color(.9f,.08f,.22f):hp>.55f?Art.Mint:hp>.28f?Art.Gold:new Color(1,.2f,.3f);
            hpValue.Draw(x,y,radius,radius,-Mathf.PI/2,Mathf.PI*2*hp,2.2f,Alpha(health,.75f));
            land.enabled=motion.Landing>0;
            if(land.enabled){float k=1-motion.Landing/.18f;land.color=new Color(.78f,.9f,.86f,(1-k)*.3f);Art.Place(land,x,feet,r*(1.4f+2.4f*k),r*(.32f+.48f*k));}
            pair.enabled=motion.PairP>.72f;
            if(pair.enabled){float k=(motion.PairP-.72f)/.28f;pair.color=new Color(1,1,1,(1-k)*.55f);Art.Place(pair,x,y+r*1.15f,r*(1+3.4f*k),r*(.24f+.8f*k));}
            for(int i=0;i<dust.Length;i++)
            {
                dust[i].enabled=motion.Walking&&!motion.Riding;
                if(dust[i].enabled){float age=Mathf.Repeat(t*13/(Mathf.PI*2)+i*.5f,1);dust[i].color=new Color(.59f,.76f,.8f,(1-age)*.24f);Art.Place(dust[i],x-r*(.3f+age),feet,r*(.1f+age*.22f),r*(.055f+age*.12f));}
            }
            float pulse=.5f+.5f*Mathf.Sin(t*5);
            FeverVisible=motion.Fever>.001f;
            feverGlow.enabled=FeverVisible;feverGlow.color=Alpha(Art.Gold,motion.Fever*(.35f+.12f*pulse));Art.Place(feverGlow,x,y,r*6,r*6);
            for(int i=0;i<3;i++)
            {
                float rad=r*(1.55f+i*.24f),start=t*(.75f+i*.2f)+i*2.3f;
                feverSoft[i].Draw(x,y,rad,rad,start,1.75f,8,Alpha(Art.Gold,motion.Fever*.1f),true);
                feverCore[i].Draw(x,y,rad,rad,start,1.75f,1.6f,Alpha(Art.Gold,motion.Fever*.72f),true);
            }
            bool burning=s.Burning&&s.Phase!=Phase.Over;
            burnGlow.enabled=burning;
            if(burning){burnGlow.color=new Color(.8f,.015f,.09f,.38f+pulse*.14f);Art.Place(burnGlow,x,y,r*(4.6f+pulse*.8f),r*(4.6f+pulse*.8f));}
            for(int i=0;i<3;i++)
            {
                if(!burning){burnDark[i].Hide();burnRed[i].Hide();burnHot[i].Hide();scythe[i].Hide();continue;}
                float rad=r*(1.42f+i*.3f+pulse*.05f),angle=t*(.9f+i*.4f)+i*2.4f;
                burnDark[i].Draw(x,y,rad,rad,angle,2.6f,r*.19f,new Color(.14f,.008f,.04f,.68f),true);
                burnRed[i].Draw(x,y,rad,rad,angle+.2f,2.4f,r*.07f,new Color(.85f,.015f,.12f,.62f),true);
                burnHot[i].Draw(x,y,rad,rad,angle+2.35f,.25f,r*.025f,new Color(1,.24f,.35f,.8f),true);
                bool attack=s.AttackT>0||motion.Holding||motion.PairP>.58f;
                float cx=attack?x+r*.55f:x+(motion.Riding?.3f:1.25f)*r,cy=attack?y:y+r*.6f;
                float bladeR=r*(attack?1.9f+i*.16f:.65f+i*.08f);
                scythe[i].Draw(cx,cy,bladeR,bladeR*(attack?.75f:.35f),attack?t*18+i*.6f:Mathf.PI*.15f+i*.12f,attack?2.6f:1.8f,attack?4-i:1.4f,new Color(1,.08f,.27f,attack?.62f:.35f),true);
            }
            for(int i=0;i<smoke.Length;i++)
            {
                smoke[i].enabled=burning;if(!burning)continue;
                float age=Mathf.Repeat(t*.32f+i*.167f,1),angle=i*2.4f+t*.4f;
                smoke[i].color=i%2==0?new Color(.13f,.005f,.025f,(1-age)*.6f):new Color(.65f,.008f,.07f,(1-age)*.35f);
                Art.Place(smoke[i],x+Mathf.Cos(angle)*r*(1+age*.6f),y+r*.4f-age*r*3.2f,r*(.5f+age*.35f),r*(1+age*1.4f),-Mathf.Cos(angle)*18);
            }
            for(int i=0;i<embers.Length;i++)
            {
                embers[i].enabled=burning;if(!burning)continue;float age=Mathf.Repeat(t*.7f+i*.2f,1);
                embers[i].color=new Color(1,.2f,.32f,Mathf.Sin(age*Mathf.PI)*.85f);
                Art.Place(embers[i],x+Mathf.Sin(i*4.1f+t)*r*1.8f,y+r*.8f-age*r*3.4f,2.3,4+age*3);
            }
            bool hairBurn=burning&&s.Character==Character.Rin;
            for(int i=0;i<2;i++)
            {
                hairGlow[i].enabled=hairBurn;
                for(int j=0;j<3;j++)hairFlame[i*3+j].enabled=hairBurn;
                if(!hairBurn)continue;
                bool attack=s.AttackT>0||motion.HoldActive||motion.PairP>0;
                float hx=x+r*(motion.Riding?(i==0?-1.76f:-1.61f):attack?(i==0?-.72f:-.88f):(i==0?-1.19f:-1.12f));
                float hy=y+r*(motion.Riding?(i==0?-.01f:.12f):attack?(i==0?.34f:.08f):(i==0?.45f:.16f));
                hairGlow[i].color=new Color(1,.025f,.15f,.65f+pulse*.15f);Art.Place(hairGlow[i],hx,hy,r*.85f,r*.6f);
                for(int j=0;j<3;j++)
                {
                    float f=.75f+.25f*Mathf.Sin(t*(9+j)+i*3+j);
                    hairFlame[i*3+j].color=j==1?new Color(1,.23f,.35f,.7f):new Color(.8f,.01f,.12f,.55f);
                    Art.Place(hairFlame[i*3+j],hx-r*(.07f+j*.06f),hy-r*(.08f+j*.025f),r*(.09f+j*.035f),r*(.27f+j*.09f)*f,25+j*13);
                }
            }
        }
        private static Color Alpha(Color c,float alpha){c.a=alpha;return c;}
    }
}
