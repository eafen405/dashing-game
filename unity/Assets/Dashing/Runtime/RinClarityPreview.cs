using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UI;
using Dashing.Core;

namespace Dashing.Unity
{
    // Review / validation only. Never runs in the normal player flow.
    public sealed class RinClarityPreview : MonoBehaviour
    {
        private sealed class Cell
        {
            public GameState S;public PlayerMotion Motion;public RinView View;public float Y;public double Clock;
        }
        private readonly Cell[] cells=new Cell[6];
        public void Begin(GameHost host){StartCoroutine(Run(host));}
        private IEnumerator Run(GameHost host)
        {
            string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../TestResults/RinClarity"));Directory.CreateDirectory(folder);
            yield return null;host.Game.S.Phase=Phase.Paused;
            host.transform.Find("Native 2D battlefield").gameObject.SetActive(false);
            host.transform.Find("Native Unity UI").gameObject.SetActive(false);
            var root=new GameObject("Fixed-pose Rin clarity review").transform;
            var canvas=new GameObject("Clarity comparison labels",typeof(Canvas),typeof(CanvasScaler)).GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            var scaler=canvas.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1280,720);
            var font=Font.CreateDynamicFontFromOSFont(new[]{"Microsoft YaHei","SimHei","Arial"},20);
            Label(canvas.transform,font,"凛 · 同一时刻 / 同一尺寸 / 同一原画",640,32,24,Color.white);
            Label(canvas.transform,font,"站姿呼吸",245,82,18,Art.Sky);Label(canvas.transform,font,"骑镰中间帧",640,82,18,Art.Sky);Label(canvas.transform,font,"出招细节",1030,82,18,Art.Sky);
            Label(canvas.transform,font,"原版渲染",640,350,16,new Color(.6f,.7f,.8f));
            Label(canvas.transform,font,"清晰化渲染",640,657,16,Art.Mint);
            Label(canvas.transform,font,"原画保留 · 2× 保真处理 · 呼吸 / 骑镰位移补偿 · 无 AI 重绘",640,692,14,new Color(.6f,.7f,.8f));
            for(int row=0;row<2;row++)for(int col=0;col<3;col++)
            {
                var s=new Game(12345,3,Character.Rin,new Layout(1280,720)).S;s.Layout.PlayerR=75;s.Layout.PlayerX=col==0?245:col==1?640:1030;
                s.Phase=col==0?Phase.Menu:Phase.Running;s.AttackT=col==2?Game.AttackDuration*.6:0;s.AttackLane=col==2?(Lane?)Lane.Bottom:null;
                var motion=new PlayerMotion();motion.Reset(s);motion.Tick(s,0);
                var view=new RinView(root,(row==0?"Original ":"Refined ")+col,10);view.Refined=row==1;
                var cell=new Cell {S=s,Motion=motion,View=view,Y=row==0?254:558,Clock=col==0?.36:col==1?3.5/12:0};cells[row*3+col]=cell;
                view.Draw(s,cell.Clock,cell.Y,motion);
            }
            for(int col=0;col<3;col++)
            {
                var a=cells[col].View;var b=cells[col+3].View;
                Check(a.FrameFrom==b.FrameFrom&&a.FrameTo==b.FrameTo&&a.FrameMix==b.FrameMix,"Fixed-pose comparison sampling changed");
                Check(a.Root.transform.localScale==b.Root.transform.localScale,"Enhanced sprites changed visual size");
                Check(!a.UsingMotion&&(col==2||b.UsingMotion),"Motion maps missing from breathing / riding");
            }
            yield return Capture(folder,"clarity-comparison.png");
            foreach(int frame in new[]{0,3,7})
            {
                for(int row=0;row<2;row++){var c=cells[row*3+1];c.Clock=(frame+.5)/12;c.View.Draw(c.S,c.Clock,c.Y,c.Motion);}
                yield return Capture(folder,"ride-midpoint-"+frame+".png");
            }
            foreach(var c in cells){c.S.Burning=true;c.View.Draw(c.S,c.Clock,c.Y,c.Motion);}
            yield return Capture(folder,"burn-comparison.png");
            File.WriteAllText(Path.Combine(folder,"native-preview.json"),"{\"passed\":true,\"pairedPoses\":3,\"rideMidpoints\":3,\"sourceFramesAndScaleMatched\":true,\"breathingAndRidingMotionMaps\":true,\"burnCompared\":true}");
            Debug.Log("DASHING_RIN_CLARITY_PREVIEW_PASS");Application.Quit(0);
        }
        private static void Check(bool ok,string message){if(!ok)throw new Exception("RIN_CLARITY_PREVIEW_FAILED: "+message);}
        private static void Label(Transform canvas,Font font,string text,float x,float y,int size,Color color)
        {
            var go=new GameObject(text,typeof(RectTransform),typeof(CanvasRenderer),typeof(Text));go.transform.SetParent(canvas,false);
            var t=go.GetComponent<Text>();t.font=font;t.fontSize=size;t.color=color;t.text=text;t.alignment=TextAnchor.MiddleCenter;t.raycastTarget=false;
            var rect=t.rectTransform;rect.anchorMin=rect.anchorMax=new Vector2(0,1);rect.pivot=new Vector2(.5f,.5f);rect.anchoredPosition=new Vector2(x,-y);rect.sizeDelta=new Vector2(1050,38);
        }
        private static IEnumerator Capture(string folder,string name)
        {
            yield return null;yield return new WaitForEndOfFrame();var texture=ScreenCapture.CaptureScreenshotAsTexture();
            var pixels=texture.GetPixels32();int visible=0;for(int i=0;i<pixels.Length;i+=97)if(pixels[i].r>40||pixels[i].g>50||pixels[i].b>65)visible++;
            if(visible<100){Destroy(texture);throw new Exception("Rin clarity screenshot is blank");}
            File.WriteAllBytes(Path.Combine(folder,name),texture.EncodeToPNG());Destroy(texture);
        }
    }
}
