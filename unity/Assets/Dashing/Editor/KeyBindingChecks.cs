using System;
using System.Text;
using UnityEngine;
using Dashing.Core;
using Dashing.Unity;

namespace Dashing.Editor
{
    public static class KeyBindingChecks
    {
        public static string Run()
        {
            int count=0;var log=new StringBuilder();
            Action<bool,string> check=(ok,name)=>{if(!ok)throw new Exception("KEY_BINDING_CHECK_FAILED: "+name);count++;log.AppendLine("PASS "+name);};
            var keys=new RailKeyBindings();string error;
            check(keys.Count(Lane.Top)==2&&keys.Get(Lane.Top,0)==KeyCode.W,"Default top controls");
            check(keys.Get(Lane.Bottom,0)==KeyCode.S,"Default bottom controls");
            check(keys.TryBind(Lane.Top,0,KeyCode.V,out error),"Replace first key");
            check(keys.TryBind(Lane.Top,2,KeyCode.C,out error)&&keys.Count(Lane.Top)==3,"Add a third key");
            check(!keys.TryBind(Lane.Top,3,KeyCode.B,out error),"Reject fourth key");
            check(!keys.TryBind(Lane.Bottom,0,KeyCode.V,out error),"Reject cross-rail duplicate");
            check(!keys.TryBind(Lane.Top,1,KeyCode.V,out error),"Reject same-rail duplicate");
            check(keys.TryBind(Lane.Top,0,KeyCode.V,out error),"Reassigning the same slot is valid");
            foreach(var key in new[]{KeyCode.P,KeyCode.Return,KeyCode.KeypadEnter,KeyCode.Space,KeyCode.Escape,KeyCode.Tab,KeyCode.F8,KeyCode.F11,KeyCode.LeftShift,KeyCode.LeftControl,KeyCode.Mouse0,(KeyCode)999})
                check(!keys.TryBind(Lane.Top,0,key,out error),"Reject reserved or invalid key "+key);
            check(keys.Get(Lane.Top,0)==KeyCode.V,"Rejected keys preserve controls");
            check(keys.Remove(Lane.Top,1)&&keys.Remove(Lane.Top,1),"Remove extra keys");
            check(!keys.Remove(Lane.Top,0)&&keys.Count(Lane.Top)==1,"Keep at least one key");
            var restored=RailKeyBindings.Load(keys.Serialize());
            check(restored.Serialize()==keys.Serialize(),"Persist and reload edited keys");
            foreach(var invalid in new[]{"broken","{}","null","{\"top\":[],\"bottom\":[115]}","{\"top\":[118],\"bottom\":[118]}","{\"top\":[112],\"bottom\":[115]}","{\"top\":[999],\"bottom\":[115]}"})
                check(RailKeyBindings.Load(invalid).Get(Lane.Top,0)==KeyCode.W,"Corrupt storage safely restores defaults");
            for(int preset=0;preset<3;preset++){keys.SetPreset(preset);check(keys.Count(Lane.Top)==2&&RailKeyBindings.Load(keys.Serialize()).Serialize()==keys.Serialize(),"Preset "+preset+" survives reload");}
            check(RailKeyBindings.Load(null,1).Get(Lane.Top,0)==KeyCode.D,"Migrate legacy preset");
            keys.SetPreset(0);check(keys.Get(Lane.Top,0)==KeyCode.W&&keys.Get(Lane.Bottom,0)==KeyCode.S,"Restore default controls");
            log.AppendLine("DASHING_KEY_BINDING_CHECKS_PASS "+count+" assertions");return log.ToString();
        }
    }
}
