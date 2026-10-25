using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    // Source hit-zone.ts: translucent fills, soft / sharp strokes, center + arrow.
    public sealed class HitZoneView
    {
        private readonly Lane lane;
        private readonly SpriteRenderer halo,outerFill,innerFill,center;
        private readonly SpriteRenderer[] arrow=new SpriteRenderer[3];
        private readonly ArcRibbon outerSoft,outerLine,innerSoft,innerLine;
        public HitZoneView(Transform parent,Lane lane)
        {
            this.lane=lane;
            halo=Art.Part("Judgment radial halo "+lane,parent,Art.Glow,Color.white,-3);
            outerFill=Art.Part("Normal judgment fill "+lane,parent,Art.Disc,Color.white,-2);
            innerFill=Art.Part("Critical judgment fill "+lane,parent,Art.Disc,Color.white,-1);
            center=Art.Part("Judgment center "+lane,parent,Art.Disc,Color.white,1);
            outerSoft=new ArcRibbon(parent,"Normal soft stroke "+lane,0);outerLine=new ArcRibbon(parent,"Normal sharp stroke "+lane,1);
            innerSoft=new ArcRibbon(parent,"Critical soft stroke "+lane,0);innerLine=new ArcRibbon(parent,"Critical sharp stroke "+lane,1);
            for(int i=0;i<3;i++)arrow[i]=Art.Part("Judgment direction "+lane,parent,Art.Square,Color.white,1);
        }
        public void Draw(GameState s,float clock,bool recording=false)
        {
            var l=s.Layout;float x=(float)l.HitX,y=(float)l.Y(lane),r=(float)l.ZoneHalf,c=(float)l.CritHalf,p=.5f+.5f*Mathf.Sin(clock*5);
            if(recording){x=(float)l.Width/2;r=30;c=10;}
            Color color=s.Fever?Art.Gold:Art.LaneColor(lane),crit=s.Fever?Color.white:Art.Gold;
            halo.color=Alpha(color,.4f+p*.15f);Art.Place(halo,x,y,r*3,r*3);
            outerFill.color=Alpha(color,.06f+p*.035f);Art.Place(outerFill,x,y,r*2,r*2);
            innerFill.color=Alpha(crit,.17f+p*.09f);Art.Place(innerFill,x,y,c*2,c*2);
            outerSoft.Draw(x,y,r,r,0,Mathf.PI*2,8,Alpha(color,.13f+p*.05f));
            outerLine.Draw(x,y,r,r,0,Mathf.PI*2,2.5f,Alpha(color,.72f+p*.26f));
            innerSoft.Draw(x,y,c,c,0,Mathf.PI*2,8,Alpha(crit,.13f+p*.05f));
            innerLine.Draw(x,y,c,c,0,Mathf.PI*2,2.5f,Alpha(crit,.78f+p*.22f));
            center.color=Alpha(color,.95f);Art.Place(center,x,y,6.8,6.8);
            for(int i=0;i<3;i++)arrow[i].color=Alpha(color,.28f);
            double arrowX=recording?x-r-21:x+r+21,headX=recording?x-r-26.5:x+r+15.5;
            Art.Place(arrow[0],arrowX,y,18,1.5);Art.Place(arrow[1],headX,y-2.5,8.6,1.5,35);Art.Place(arrow[2],headX,y+2.5,8.6,1.5,-35);
        }
        private static Color Alpha(Color c,float a){c.a=a;return c;}
    }
}
