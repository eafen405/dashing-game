using System;
using System.Text;
using UnityEngine;
using UnityEditor;

namespace Dashing.Editor
{
    public static class RinClarityChecks
    {
        public static string Run()
        {
            var log=new StringBuilder();int checks=0;
            Action<bool,string> check=(ok,name)=>{if(!ok)throw new Exception("RIN_CLARITY_CHECK_FAILED: "+name);checks++;log.AppendLine("PASS "+name);};
            foreach(var prefix in new[]{"idle","atk","ride"})
            {
                int count=prefix=="idle"?5:prefix=="atk"?12:9;
                for(int i=0;i<count;i++)
                {
                    string name=prefix+"-"+i;var original=Resources.Load<Texture2D>("Rin/"+name);var refined=Resources.Load<Texture2D>("RinRefined/"+name);
                    check(original!=null&&refined!=null,name+" original and enhanced assets present");
                    check(refined.width==original.width*2&&refined.height==original.height*2,name+" exact 2x canvas / unchanged normalized anchor");
                    var imp=(TextureImporter)AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(refined));
                    check(imp.textureCompression==TextureImporterCompression.Uncompressed&&imp.mipmapEnabled&&imp.mipmapFilter==TextureImporterMipFilter.KaiserFilter,name+" lossless import and detailed minification");
                }
            }
            for(int i=0;i<3;i++){CheckFlow("idle-"+i+"-"+(i+1),check);CheckFlow("idle-"+(i+1)+"-"+i,check);}
            for(int i=0;i<9;i++){int n=(i+1)%9;CheckFlow("ride-"+i+"-"+n,check);CheckFlow("ride-"+n+"-"+i,check);}
            check(Resources.Load<Shader>("Shaders/RinBlend")!=null,"Motion-aware premultiplied sprite shader present");
            log.AppendLine("DASHING_RIN_CLARITY_CHECKS_PASS "+checks+" assertions");return log.ToString();
        }
        private static void CheckFlow(string name,Action<bool,string> check)
        {
            var texture=Resources.Load<Texture2D>("RinMotion/"+name);check(texture!=null,name+" correspondence present");
            var imp=(TextureImporter)AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(texture));
            check(!imp.sRGBTexture&&!imp.alphaIsTransparency&&!imp.mipmapEnabled&&imp.textureCompression==TextureImporterCompression.Uncompressed,name+" motion data stays linear / uncompressed");
        }
    }
}
