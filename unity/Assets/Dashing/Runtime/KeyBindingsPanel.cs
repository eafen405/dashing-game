using System;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using Dashing.Core;

namespace Dashing.Unity
{
    /// <summary>Six editable slots; captures keys before game shortcuts.</summary>
    public sealed class KeyBindingsPanel
    {
        private readonly GameHost host;
        private readonly GameObject panel;
        private readonly Font font;
        private readonly Action onClose;
        private readonly Button[,] slots=new Button[2,3],remove=new Button[2,3];
        private readonly Text status;
        private static readonly KeyCode[] Codes=(KeyCode[])Enum.GetValues(typeof(KeyCode));
        private int listeningRail=-1,listeningSlot;
        private bool previousNavigation;
        public bool IsOpen {get {return panel.activeSelf;}}
        public bool Listening {get {return listeningRail>=0;}}
        public bool HasError {get;private set;}
        public KeyBindingsPanel(GameHost host,Transform canvas,Font font,Action onClose)
        {
            this.host=host;this.font=font;this.onClose=onClose;
            panel=new GameObject("Key bindings panel",typeof(RectTransform));panel.transform.SetParent(canvas,false);
            Place((RectTransform)panel.transform,new Vector2(0,0),new Vector2(620,570));
            Label("按键设置",new Vector2(0,225),new Vector2(600,55),32,Color.white);
            Label("每轨绑定 1–3 个键 · 点键位后按下新键\nEsc 取消听键，再按一次返回",new Vector2(0,165),new Vector2(600,60),16,new Color(.7f,.8f,.93f));
            for(int r=0;r<2;r++)
            {
                int rail=r;float y=r==0?60:-50;
                Label(r==0?"上轨":"下轨",new Vector2(-245,y),new Vector2(90,45),22,Art.LaneColor((Lane)r));
                for(int k=0;k<3;k++)
                {
                    int slot=k;float x=-105+k*145;
                    slots[r,k]=Button("键位",new Vector2(x,y+7),new Vector2(125,45),()=>{listeningRail=rail;listeningSlot=slot;HasError=false;Refresh();});
                    remove[r,k]=Button("移除",new Vector2(x,y-34),new Vector2(78,28),()=>{if(host.Keys.Remove((Lane)rail,slot)){host.SaveKeys();listeningRail=-1;HasError=false;Refresh();}});
                    remove[r,k].GetComponentInChildren<Text>().fontSize=13;
                }
            }
            status=Label("",new Vector2(0,-129),new Vector2(600,48),15,Art.Mint);
            string[] presets={"W/↑ + S/↓","D/F + J/K","←/A + →/L"};
            for(int i=0;i<3;i++){int preset=i;Button(presets[i],new Vector2((i-1)*195,-185),new Vector2(185,36),()=>{host.SetKeyPreset(preset);listeningRail=-1;HasError=false;Refresh();});}
            Button("恢复默认",new Vector2(-145,-247),new Vector2(240,44),()=>{host.SetKeyPreset(0);listeningRail=-1;HasError=false;Refresh();});
            Button("返回",new Vector2(145,-247),new Vector2(240,44),Close);
            panel.SetActive(false);
        }
        public void Open()
        {
            if(IsOpen)return;
            previousNavigation=EventSystem.current!=null&&EventSystem.current.sendNavigationEvents;
            if(EventSystem.current!=null){EventSystem.current.sendNavigationEvents=false;EventSystem.current.SetSelectedGameObject(null);}
            listeningRail=-1;HasError=false;panel.SetActive(true);Refresh();
        }
        public void Close()
        {
            if(!IsOpen)return;
            panel.SetActive(false);listeningRail=-1;
            if(EventSystem.current!=null)EventSystem.current.sendNavigationEvents=previousNavigation;
            onClose();
        }
        public bool HandleInput()
        {
            if(!IsOpen)return false;
            if(Input.GetKeyDown(KeyCode.Escape))
            {if(Listening){listeningRail=-1;HasError=false;Refresh();}else Close();return true;}
            if(Listening&&Input.anyKeyDown)
            {
                foreach(var code in Codes)
                {
                    if(code==KeyCode.None||(int)code>=(int)KeyCode.Mouse0||!Input.GetKeyDown(code))continue;
                    string error;
                    if(host.Keys.TryBind((Lane)listeningRail,listeningSlot,code,out error))
                    {host.SaveKeys();listeningRail=-1;HasError=false;Refresh();}
                    else {HasError=true;Refresh();status.text=error;status.color=new Color(1,.4f,.45f);}
                    break;
                }
            }
            return true;
        }
        private void Refresh()
        {
            for(int r=0;r<2;r++)for(int k=0;k<3;k++)
            {
                int count=host.Keys.Count((Lane)r);bool filled=k<count;
                slots[r,k].interactable=k<=count;
                slots[r,k].GetComponentInChildren<Text>().text=listeningRail==r&&listeningSlot==k?"按下新键…":filled?RailKeyBindings.Label(host.Keys.Get((Lane)r,k)):k==count?"+ 添加":"—";
                remove[r,k].gameObject.SetActive(filled);remove[r,k].interactable=count>1;
            }
            status.text=Listening?"正在听键：Esc 取消；开始 / 暂停 / F8 / F11 等控制键不可绑定。":"修改立即生效并保存 · 同一按键不能重复绑定";
            status.color=Art.Mint;
        }
        private Text Label(string text,Vector2 position,Vector2 size,int fontSize,Color color)
        {
            var go=new GameObject(text,typeof(RectTransform),typeof(CanvasRenderer),typeof(Text));go.transform.SetParent(panel.transform,false);
            var label=go.GetComponent<Text>();label.font=font;label.fontSize=fontSize;label.color=color;label.alignment=TextAnchor.MiddleCenter;label.raycastTarget=false;label.text=text;
            Place(label.rectTransform,position,size);return label;
        }
        private Button Button(string text,Vector2 position,Vector2 size,Action action)
        {
            var go=new GameObject(text,typeof(RectTransform),typeof(CanvasRenderer),typeof(Image),typeof(Button));go.transform.SetParent(panel.transform,false);
            var background=go.GetComponent<Image>();background.color=new Color(.12f,.19f,.28f,.98f);
            var button=go.GetComponent<Button>();button.targetGraphic=background;Place((RectTransform)go.transform,position,size);
            var label=Label(text,Vector2.zero,size,17,Color.white);label.transform.SetParent(go.transform,false);Place(label.rectTransform,Vector2.zero,size);
            button.onClick.AddListener(()=>{if(EventSystem.current!=null)EventSystem.current.SetSelectedGameObject(null);action();});return button;
        }
        private static void Place(RectTransform rect,Vector2 position,Vector2 size)
        {rect.anchorMin=rect.anchorMax=rect.pivot=new Vector2(.5f,.5f);rect.anchoredPosition=position;rect.sizeDelta=size;}
    }
}
