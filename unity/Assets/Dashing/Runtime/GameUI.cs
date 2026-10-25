using System;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using Dashing.Core;

namespace Dashing.Unity
{
    public sealed class GameUI
    {
        private readonly GameHost host;
        private readonly Transform canvas;
        private readonly Font font;
        private readonly Text rinQuality;
        private readonly Text[] zoneCrit=new Text[2],zoneNormal=new Text[2],zoneHint=new Text[2];
        private readonly Text score,combo,hp,best,stats,toast,mode,fever,hold;
        private readonly Image healthFill,feverFill,veil;
        private readonly RectTransform hudBar,healthTrack,pauseRect,fullRect,feverTrackRect;
        private readonly Text hints;
        private readonly GameObject menu;
        private readonly Text heading,detail,charInfo,keyInfo,startLabel;
        private readonly Button start,character,difficulty,help,keys,quit;
        private readonly Button pointer;
        private readonly KeyBindingsPanel keyPanel;
        public bool KeyEditorOpen {get {return keyPanel.IsOpen;}}
        public bool Listening {get {return keyPanel.Listening;}}
        public bool KeyError {get {return keyPanel.HasError;}}
        public bool HandleKeyInput(){return keyPanel.HandleInput();}
        private float toastT;
        private bool showHelp;
        private Phase lastPhase=(Phase)(-1);
        private float lastWidth;
        public bool IsPointerOnUI {get {return EventSystem.current!=null&&EventSystem.current.IsPointerOverGameObject();}}
        public GameUI(GameHost host)
        {
            this.host=host;
            font=Font.CreateDynamicFontFromOSFont(new[]{"Microsoft YaHei","SimHei","Arial"},22);
            if(font==null)font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var c=new GameObject("Native Unity UI",typeof(Canvas),typeof(CanvasScaler),typeof(GraphicRaycaster));canvas=c.transform;canvas.SetParent(host.transform,false);
            var cv=c.GetComponent<Canvas>();cv.renderMode=RenderMode.ScreenSpaceOverlay;cv.sortingOrder=100;
            var scaler=c.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1280,720);scaler.matchWidthOrHeight=.5f;
            if(EventSystem.current==null)new GameObject("UI Event System",typeof(EventSystem),typeof(StandaloneInputModule));
            var bar=Panel("HUD bar",canvas,new Color(.025f,.045f,.085f,.94f));Anchor(bar.rectTransform,new Vector2(0,1),new Vector2(1,1),new Vector2(0,-34),new Vector2(0,68));
            hudBar=bar.rectTransform;
            var track=Panel("HP track",canvas,new Color(.12f,.16f,.22f));Place(track.rectTransform,new Vector2(0,1),new Vector2(156,-33),new Vector2(230,12));
            healthTrack=track.rectTransform;
            healthFill=Panel("HP",track.transform,new Color(1,.32f,.43f));healthFill.rectTransform.anchorMin=Vector2.zero;healthFill.rectTransform.anchorMax=Vector2.one;healthFill.rectTransform.offsetMin=healthFill.rectTransform.offsetMax=Vector2.zero;
            hp=Label("HP",canvas,15,Color.white);Place(hp.rectTransform,new Vector2(0,1),new Vector2(342,-33),new Vector2(130,30));
            score=Label("Score",canvas,22,Color.white);Place(score.rectTransform,new Vector2(.5f,1),new Vector2(-80,-28),new Vector2(170,60));
            combo=Label("Combo",canvas,22,Art.Gold);Place(combo.rectTransform,new Vector2(.5f,1),new Vector2(80,-28),new Vector2(140,60));
            stats=Label("Judgements",canvas,13,new Color(.66f,.74f,.87f));Place(stats.rectTransform,new Vector2(.5f,1),new Vector2(245,-29),new Vector2(180,50));
            best=Label("Best",canvas,13,new Color(.66f,.74f,.87f));Place(best.rectTransform,new Vector2(1,1),new Vector2(-144,-30),new Vector2(100,50));
            var pause=Button("Ⅱ",canvas,()=>host.TogglePause());Place(pause.GetComponent<RectTransform>(),new Vector2(1,1),new Vector2(-37,-32),new Vector2(48,42));
            var full=Button("□",canvas,()=>host.ToggleFullscreen());Place(full.GetComponent<RectTransform>(),new Vector2(1,1),new Vector2(-91,-32),new Vector2(42,42));
            pauseRect=pause.GetComponent<RectTransform>();fullRect=full.GetComponent<RectTransform>();
            mode=Label("Mode",canvas,13,new Color(.57f,.66f,.8f));Place(mode.rectTransform,new Vector2(1,1),new Vector2(-200,-85),new Vector2(360,28));mode.alignment=TextAnchor.MiddleRight;
            fever=Label("FEVER",canvas,24,Art.Gold);Place(fever.rectTransform,new Vector2(.5f,1),new Vector2(0,-106),new Vector2(430,40));
            var feverTrack=Panel("Fever track",canvas,new Color(.15f,.13f,.12f,.7f));Place(feverTrack.rectTransform,new Vector2(.5f,1),new Vector2(0,-133),new Vector2(280,4));
            feverTrackRect=feverTrack.rectTransform;
            feverFill=Panel("Fever fill",feverTrack.transform,Art.Gold);feverFill.rectTransform.anchorMin=Vector2.zero;feverFill.rectTransform.anchorMax=Vector2.one;feverFill.rectTransform.offsetMin=feverFill.rectTransform.offsetMax=Vector2.zero;
            toast=Label("Feedback",canvas,24,Art.Gold);Place(toast.rectTransform,new Vector2(.5f,.5f),new Vector2(100,0),new Vector2(720,65));
            hold=Label("Hold status",canvas,18,Art.Mint);Place(hold.rectTransform,new Vector2(.5f,0),new Vector2(0,75),new Vector2(760,40));
            hints=Label("Controls",canvas,14,new Color(.55f,.65f,.78f));Place(hints.rectTransform,new Vector2(.5f,0),new Vector2(0,25),new Vector2(1000,40));
            hints.text="上轨 W / ↑   ·   下轨 S / ↓   ·   鼠标点击上下半屏   ·   P / Esc 暂停   ·   F11 全屏";
            for(int i=0;i<2;i++)
            {
                zoneCrit[i]=Label("Critical zone label",canvas,11,Art.Gold);zoneCrit[i].text="暴击";
                zoneNormal[i]=Label("Normal zone label",canvas,10,Art.LaneColor((Lane)i));zoneNormal[i].text="普攻";
                zoneHint[i]=Label("Hit point hint",canvas,11,Art.LaneColor((Lane)i));
            }
            veil=Panel("Menu dimmer",canvas,new Color(.01f,.02f,.05f,.82f));Stretch(veil.rectTransform);veil.raycastTarget=true;
            menu=new GameObject("Menu panel",typeof(RectTransform));menu.transform.SetParent(canvas,false);Place(menu.GetComponent<RectTransform>(),new Vector2(.5f,.5f),Vector2.zero,new Vector2(600,570));
            var title=Label("Title",menu.transform,42,Color.white);Place(title.rectTransform,new Vector2(.5f,1),new Vector2(0,-35),new Vector2(600,60));title.text="双轨打怪";
            var native=Label("Native",menu.transform,13,Art.Sky);Place(native.rectTransform,new Vector2(.5f,1),new Vector2(0,-77),new Vector2(600,30));native.text="NATIVE UNITY 2D  /  D A S H I N G";
            rinQuality=native;
            heading=Label("Heading",menu.transform,22,Art.Gold);Place(heading.rectTransform,new Vector2(.5f,1),new Vector2(0,-123),new Vector2(570,40));
            detail=Label("Details",menu.transform,16,new Color(.73f,.81f,.93f));Place(detail.rectTransform,new Vector2(.5f,1),new Vector2(0,-173),new Vector2(580,68));
            character=Button("角色",menu.transform,()=>{host.SelectCharacter();RefreshMenu();});Place(character.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(-145,-243),new Vector2(275,48));
            difficulty=Button("难度",menu.transform,()=>{host.SelectDifficulty();RefreshMenu();});Place(difficulty.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(145,-243),new Vector2(275,48));
            charInfo=Label("Character details",menu.transform,15,new Color(.8f,.68f,.8f));Place(charInfo.rectTransform,new Vector2(.5f,1),new Vector2(0,-296),new Vector2(590,50));
            help=Button("玩法说明",menu.transform,()=>{showHelp=!showHelp;RefreshMenu();});Place(help.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(-145,-350),new Vector2(275,44));
            keys=Button("按键设置",menu.transform,()=>keyPanel.Open());Place(keys.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(145,-350),new Vector2(275,44));
            keyInfo=Label("Key layout",menu.transform,15,new Color(.6f,.71f,.86f));Place(keyInfo.rectTransform,new Vector2(.5f,1),new Vector2(0,-396),new Vector2(590,40));
            pointer=Button("手法",menu.transform,()=>{host.TogglePointer();RefreshMenu();});Place(pointer.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(0,-112),new Vector2(250,32));
            Place(heading.rectTransform,new Vector2(.5f,1),new Vector2(0,-150),new Vector2(570,36));
            Place(detail.rectTransform,new Vector2(.5f,1),new Vector2(0,-197),new Vector2(580,58));
            detail.fontSize=14;
            start=Button("开始游戏",menu.transform,()=>{showHelp=false;host.StartOrResume();});Place(start.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(0,-454),new Vector2(360,56));
            start.GetComponent<Image>().color=new Color(.1f,.32f,.43f,.96f);startLabel=start.GetComponentInChildren<Text>();startLabel.fontSize=23;
            quit=Button("退出游戏",menu.transform,()=>host.ExitOrMenu());Place(quit.GetComponent<RectTransform>(),new Vector2(.5f,1),new Vector2(0,-524),new Vector2(220,38));
            keyPanel=new KeyBindingsPanel(host,canvas,font,()=>RefreshMenu());
            RefreshMenu();
        }
        public void ShowCue(Cue cue)
        {
            if(string.IsNullOrEmpty(cue.Text))return;
            toastT=cue.Kind==CueKind.Notice?2.2f:1.2f;toast.text=cue.Text;
            toast.color=cue.Kind==CueKind.Hurt||cue.Kind==CueKind.Miss?new Color(1,.35f,.47f):cue.Critical?Art.Gold:cue.Kind==CueKind.Hold?Art.Mint:Color.white;
        }
        private void RefreshMenu()
        {
            var s=host.Game.S;bool paused=s.Phase==Phase.Paused,over=s.Phase==Phase.Over;
            heading.text=paused?"已暂停":over?"本轮结束":"选择角色 · 准备出发";
            detail.text=showHelp?"中心暴击 300 / 普攻 200 · 每 50 连击 FEVER ×1.5\n双生：0.18 秒内打双轨 · 长按：按住 2 秒，另一轨可灵魂出击":over?"得分 "+s.Score+"    最大连击 "+s.MaxCombo+"\n暴击 "+s.CritCount+"    普攻 "+s.NormalCount+"    存活 "+s.Now.ToString("F1")+" 秒":paused?"暂停后长按不会失败，继续后请重新按住。\n按 P / Esc 或点击继续，回到战场。":"击打两条轨道上的敌人，在中心判定区获得暴击。\n上轨为空中，下轨为地面。";
            character.GetComponentInChildren<Text>().text="角色 · "+(host.SelectedCharacter==Character.Rin?"凛 / 镰刀":"哲 / 棒球棍");
            difficulty.GetComponentInChildren<Text>().text="难度 · "+new string('★',host.Difficulty);
            character.interactable=difficulty.interactable=!paused;
            charInfo.text=host.SelectedCharacter==Character.Rin?"凛：初始 125 / 250 HP · 命中 +5 · 满血燃魂得分 ×2":"哲：300 HP · 更高生命上限 · 棒球棍出击";
            keyInfo.text="当前按键："+host.KeyDescription+"     Enter / Space 开始";
            pointer.GetComponentInChildren<Text>().text="手法 · "+(host.Horizontal?"左右":"上下");pointer.GetComponentInChildren<Text>().fontSize=15;
            startLabel.text=paused?"继续游戏":over?"再来一局":"开始游戏";
            quit.GetComponentInChildren<Text>().text=paused||over?"返回主菜单":"退出游戏";
        }
        public void Update(float dt)
        {
            var s=host.Game.S;
            float width=((RectTransform)canvas).rect.width;
            rinQuality.text="UNITY 2D  /  F8 凛画质："+(host.RefinedRin?"精细":"原版");
            if(Mathf.Abs(lastWidth-width)>1){lastWidth=width;ResponsiveLayout(width);}
            if(s.Phase!=lastPhase){lastPhase=s.Phase;keyPanel.Close();RefreshMenu();}
            bool visible=s.Phase!=Phase.Running;menu.SetActive(visible&&!keyPanel.IsOpen);veil.gameObject.SetActive(visible);
            score.text=s.Score.ToString("N0")+"\n<size=11>SCORE</size>";combo.text=s.Combo+"\n<size=11>COMBO</size>";
            hp.text=s.Hp+" / "+s.MaxHp;stats.text=s.CritCount+" / "+s.NormalCount+"\n暴击 / 普攻";best.text=host.Best+"\nBEST";
            healthFill.rectTransform.anchorMax=new Vector2((float)s.Hp/s.MaxHp,1);
            float health=(float)s.Hp/s.MaxHp;healthFill.color=s.Burning?new Color(1,.12f,.27f):health>.55f?Art.Mint:health>.28f?Art.Gold:new Color(1,.2f,.3f);
            UpdateZoneLabels(s);
            mode.text=new string('★',host.Difficulty)+"  ·  "+(s.Character==Character.Rin?"凛":"哲")+"  ·  "+s.Now.ToString("F0")+"s";
            fever.text=s.Fever?"FEVER ×1.5   "+s.FeverT.ToString("F1")+"s" :s.Burning?"燃魂 ×2":"";
            feverFill.transform.parent.gameObject.SetActive(s.Fever);feverFill.rectTransform.anchorMax=new Vector2((float)s.FeverT/10,1);
            if(s.Fever&&s.Burning)fever.text="FEVER + 燃魂 ×3   "+s.FeverT.ToString("F1")+"s";
            var held=host.Game.Find(s.HoldId);hold.text=held!=null?"长按中  "+held.HoldT.ToString("F1")+" / 2.0 秒  ·  另一轨可灵魂出击":"";
            hints.text=host.KeyDescription+"   ·   "+host.PointerDescription+"   ·   P / Esc 暂停   ·   F11 全屏";
            if(s.Phase!=Phase.Paused)toastT=Mathf.Max(0,toastT-dt);Color tc=toast.color;tc.a=Mathf.Clamp01(toastT*3);toast.color=tc;
        }
        private void UpdateZoneLabels(GameState s)
        {
            var l=s.Layout;
            for(int i=0;i<2;i++)
            {
                Lane lane=(Lane)i;float x=(float)(l.HitX/l.Width),y=(float)l.Y(lane),r=(float)l.ZoneHalf,c=(float)l.CritHalf;
                Place(zoneCrit[i].rectTransform,new Vector2(x,1-(y-c-9)/(float)l.Height),Vector2.zero,new Vector2(70,20));
                Place(zoneNormal[i].rectTransform,new Vector2(x,1-(y+c+10)/(float)l.Height),Vector2.zero,new Vector2(70,20));
                float labelY=Mathf.Clamp(i==0?y-r-16:y+r+18,12,(float)l.Height-12);
                Place(zoneHint[i].rectTransform,new Vector2(x,1-labelY/(float)l.Height),Vector2.zero,new Vector2(190,22));
                Color color=s.Fever?Art.Gold:Art.LaneColor(lane);zoneNormal[i].color=new Color(color.r,color.g,color.b,.8f);zoneHint[i].color=new Color(color.r,color.g,color.b,.66f);
                zoneCrit[i].color=s.Fever?Color.white:Art.Gold;
                bool longHere=false;foreach(var m in s.Monsters)if(!m.Removed&&m.Kind==MonsterKind.Hold&&m.Lane==lane){longHere=true;break;}
                zoneHint[i].enabled=!longHere;
                zoneHint[i].text="打击点 · 点击"+(host.Horizontal?(i==0?"左":"右"):(i==0?"上":"下"))+"半屏";
            }
        }
        private void ResponsiveLayout(float width)
        {
            bool narrow=width<1100;
            Anchor(hudBar,new Vector2(0,1),new Vector2(1,1),new Vector2(0,narrow?-55:-34),new Vector2(0,narrow?110:68));
            Place(healthTrack,new Vector2(0,1),new Vector2(narrow?105:156,-33),new Vector2(narrow?170:230,12));
            Place(hp.rectTransform,new Vector2(0,1),new Vector2(narrow?265:342,-33),new Vector2(130,30));
            Place(score.rectTransform,narrow?new Vector2(0,1):new Vector2(.5f,1),narrow?new Vector2(105,-80):new Vector2(-80,-28),new Vector2(170,60));
            Place(combo.rectTransform,narrow?new Vector2(0,1):new Vector2(.5f,1),narrow?new Vector2(265,-80):new Vector2(80,-28),new Vector2(140,60));
            Place(stats.rectTransform,narrow?new Vector2(0,1):new Vector2(.5f,1),narrow?new Vector2(430,-80):new Vector2(245,-29),new Vector2(180,50));
            Place(best.rectTransform,new Vector2(1,1),new Vector2(narrow?-60:-144,narrow?-80:-30),new Vector2(100,50));
            Place(pauseRect,new Vector2(1,1),new Vector2(-37,-32),new Vector2(48,42));Place(fullRect,new Vector2(1,1),new Vector2(-91,-32),new Vector2(42,42));
            Place(mode.rectTransform,new Vector2(1,1),new Vector2(-200,narrow?-126:-85),new Vector2(360,28));
            Place(fever.rectTransform,new Vector2(.5f,1),new Vector2(0,narrow?-159:-106),new Vector2(430,40));
            Place(feverTrackRect,new Vector2(.5f,1),new Vector2(0,narrow?-186:-133),new Vector2(280,4));
            hints.rectTransform.sizeDelta=new Vector2(Mathf.Min(width-30,1000),50);hints.resizeTextForBestFit=true;hints.resizeTextMinSize=10;hints.resizeTextMaxSize=14;
            toast.rectTransform.sizeDelta=new Vector2(Mathf.Min(width-30,720),65);
            hold.rectTransform.sizeDelta=new Vector2(Mathf.Min(width-30,760),50);hold.resizeTextForBestFit=true;hold.resizeTextMinSize=12;hold.resizeTextMaxSize=18;
        }
        private Image Panel(string name,Transform parent,Color color)
        {var go=new GameObject(name,typeof(RectTransform),typeof(CanvasRenderer),typeof(Image));go.transform.SetParent(parent,false);var im=go.GetComponent<Image>();im.color=color;im.raycastTarget=false;return im;}
        private Text Label(string name,Transform parent,int size,Color color)
        {var go=new GameObject(name,typeof(RectTransform),typeof(CanvasRenderer),typeof(Text));go.transform.SetParent(parent,false);var t=go.GetComponent<Text>();t.font=font;t.fontSize=size;t.color=color;t.alignment=TextAnchor.MiddleCenter;t.raycastTarget=false;t.supportRichText=true;return t;}
        private Button Button(string name,Transform parent,Action click)
        {
            var im=Panel(name,parent,new Color(.12f,.16f,.24f,.95f));im.raycastTarget=true;var b=im.gameObject.AddComponent<Button>();
            b.targetGraphic=im;var colors=b.colors;colors.highlightedColor=new Color(.6f,.85f,1);colors.pressedColor=new Color(.3f,.65f,.9f);b.colors=colors;
            var text=Label(name+" label",im.transform,18,Color.white);text.text=name;Stretch(text.rectTransform);b.onClick.AddListener(()=>{EventSystem.current.SetSelectedGameObject(null);click();});return b;
        }
        private static void Stretch(RectTransform r){r.anchorMin=Vector2.zero;r.anchorMax=Vector2.one;r.offsetMin=r.offsetMax=Vector2.zero;}
        private static void Place(RectTransform r,Vector2 anchor,Vector2 position,Vector2 size){r.anchorMin=r.anchorMax=anchor;r.pivot=new Vector2(.5f,.5f);r.anchoredPosition=position;r.sizeDelta=size;}
        private static void Anchor(RectTransform r,Vector2 min,Vector2 max,Vector2 position,Vector2 size){r.anchorMin=min;r.anchorMax=max;r.anchoredPosition=position;r.sizeDelta=size;}
    }
}
