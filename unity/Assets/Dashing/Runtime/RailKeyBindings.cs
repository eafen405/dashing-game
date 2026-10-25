using System;
using System.Collections.Generic;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    /// <summary>Editable keyboard controls. Pointer controls remain independent.</summary>
    public sealed class RailKeyBindings
    {
        public const int MaxKeys=3;
        private readonly List<KeyCode>[] rails={new List<KeyCode>(),new List<KeyCode>()};
        private string description;
        private static readonly KeyCode[][] Presets={
            new[]{KeyCode.W,KeyCode.UpArrow,KeyCode.S,KeyCode.DownArrow},
            new[]{KeyCode.D,KeyCode.F,KeyCode.J,KeyCode.K},
            new[]{KeyCode.LeftArrow,KeyCode.A,KeyCode.RightArrow,KeyCode.L}};
        [Serializable] private sealed class Saved {public int[] top;public int[] bottom;}
        public RailKeyBindings(int preset=0){SetPreset(preset);}
        public int Count(Lane lane){return rails[(int)lane].Count;}
        public KeyCode Get(Lane lane,int index){return rails[(int)lane][index];}
        public void SetPreset(int preset)
        {
            description=null;
            var keys=Presets[Math.Max(0,Math.Min(Presets.Length-1,preset))];
            for(int i=0;i<2;i++){rails[i].Clear();rails[i].Add(keys[i*2]);rails[i].Add(keys[i*2+1]);}
        }
        public static bool IsBindable(KeyCode key)
        {
            if(key==KeyCode.None||!Enum.IsDefined(typeof(KeyCode),key)||(int)key>=(int)KeyCode.Mouse0)return false;
            switch(key)
            {
                case KeyCode.P:case KeyCode.Return:case KeyCode.KeypadEnter:case KeyCode.Space:
                case KeyCode.Escape:case KeyCode.Backspace:case KeyCode.Tab:case KeyCode.F8:case KeyCode.F11:
                case KeyCode.LeftShift:case KeyCode.RightShift:case KeyCode.LeftControl:case KeyCode.RightControl:
                case KeyCode.LeftAlt:case KeyCode.RightAlt:case KeyCode.LeftCommand:case KeyCode.RightCommand:
                case KeyCode.LeftWindows:case KeyCode.RightWindows:case KeyCode.AltGr:
                case KeyCode.CapsLock:case KeyCode.Numlock:case KeyCode.ScrollLock:return false;
                default:return true;
            }
        }
        public bool TryBind(Lane lane,int index,KeyCode key,out string error)
        {
            error=null;var list=rails[(int)lane];
            if(index<0||index>list.Count||index>=MaxKeys){error="每轨最多绑定 3 个键。";return false;}
            if(!IsBindable(key)){error="这个键用于控制或系统功能，请换一个键。";return false;}
            for(int r=0;r<2;r++)for(int k=0;k<rails[r].Count;k++)
                if(rails[r][k]==key&&(r!=(int)lane||k!=index)){error="这个键已绑定，请换一个键。";return false;}
            if(index==list.Count)list.Add(key);else list[index]=key;
            description=null;
            return true;
        }
        public bool Remove(Lane lane,int index)
        {
            var list=rails[(int)lane];if(list.Count<=1||index<0||index>=list.Count)return false;
            list.RemoveAt(index);description=null;return true;
        }
        public string Describe()
        {
            if(description!=null)return description;
            var parts=new string[2];
            for(int r=0;r<2;r++){var keys=new string[rails[r].Count];for(int k=0;k<keys.Length;k++)keys[k]=Label(rails[r][k]);parts[r]=(r==0?"上 ":"下 ")+string.Join(" / ",keys);}
            return description=string.Join("，",parts);
        }
        public static string Label(KeyCode key)
        {
            switch(key){case KeyCode.UpArrow:return "↑";case KeyCode.DownArrow:return "↓";case KeyCode.LeftArrow:return "←";case KeyCode.RightArrow:return "→";}
            if(key>=KeyCode.Alpha0&&key<=KeyCode.Alpha9)return ((int)key-(int)KeyCode.Alpha0).ToString();
            if(key>=KeyCode.Keypad0&&key<=KeyCode.Keypad9)return "小键盘 "+((int)key-(int)KeyCode.Keypad0);
            return key.ToString();
        }
        public string Serialize()
        {return JsonUtility.ToJson(new Saved{top=rails[0].ConvertAll(k=>(int)k).ToArray(),bottom=rails[1].ConvertAll(k=>(int)k).ToArray()});}
        public static RailKeyBindings Load(string json,int fallbackPreset=0)
        {
            var fallback=new RailKeyBindings(fallbackPreset);if(string.IsNullOrEmpty(json))return fallback;
            try
            {
                var saved=JsonUtility.FromJson<Saved>(json);if(saved==null)return fallback;
                var lists=new[]{saved.top,saved.bottom};var used=new HashSet<KeyCode>();
                foreach(var list in lists)
                {if(list==null||list.Length<1||list.Length>MaxKeys)return fallback;foreach(int value in list)if(!IsBindable((KeyCode)value)||!used.Add((KeyCode)value))return fallback;}
                for(int r=0;r<2;r++){fallback.rails[r].Clear();foreach(int value in lists[r])fallback.rails[r].Add((KeyCode)value);}
                return fallback;
            }
            catch(ArgumentException){return fallback;}
        }
    }
}
