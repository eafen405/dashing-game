using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using UnityEngine;
using Dashing.Unity;

namespace Dashing.Editor
{
    public static class UnityPort
    {
        [MenuItem("Dashing/Prepare Native 2D Project")]
        public static void Prepare()
        {
            EditorSettings.defaultBehaviorMode=EditorBehaviorMode.Mode2D;
            PlayerSettings.companyName="Dashing Game";PlayerSettings.productName="双轨打怪";
            PlayerSettings.bundleVersion="0.4.0";PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;
            PlayerSettings.fullScreenMode=FullScreenMode.Windowed;PlayerSettings.resizableWindow=true;
            PlayerSettings.runInBackground=false;PlayerSettings.colorSpace=ColorSpace.Gamma;
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
            PlayerSettings.SetApiCompatibilityLevel(BuildTargetGroup.Standalone,ApiCompatibilityLevel.NET_Standard_2_0);
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Standalone,"com.dashing.native2d");
            QualitySettings.vSyncCount=1;
            QualitySettings.antiAliasing=4;
            foreach(var guid in AssetDatabase.FindAssets("t:Texture2D",new[]{"Assets/Resources/Rin"}))
            {
                var path=AssetDatabase.GUIDToAssetPath(guid);var importer=(TextureImporter)AssetImporter.GetAtPath(path);
                importer.textureType=TextureImporterType.Default;importer.alphaIsTransparency=true;importer.sRGBTexture=true;
                importer.mipmapEnabled=false;importer.npotScale=TextureImporterNPOTScale.None;importer.wrapMode=TextureWrapMode.Clamp;
                importer.filterMode=FilterMode.Bilinear;importer.textureCompression=TextureImporterCompression.Uncompressed;
                importer.maxTextureSize=2048;importer.SaveAndReimport();
            }
            foreach(var guid in AssetDatabase.FindAssets("t:Texture2D",new[]{"Assets/Resources/RinRefined","Assets/Resources/RinMotion"}))
            {
                var path=AssetDatabase.GUIDToAssetPath(guid);bool flow=path.Contains("/RinMotion/");
                var importer=(TextureImporter)AssetImporter.GetAtPath(path);
                importer.textureType=TextureImporterType.Default;importer.alphaIsTransparency=!flow;importer.sRGBTexture=!flow;
                importer.npotScale=TextureImporterNPOTScale.None;importer.wrapMode=TextureWrapMode.Clamp;
                importer.textureCompression=TextureImporterCompression.Uncompressed;importer.maxTextureSize=2048;
                importer.mipmapEnabled=!flow;importer.mipmapFilter=TextureImporterMipFilter.KaiserFilter;
                importer.filterMode=flow?FilterMode.Bilinear:FilterMode.Trilinear;importer.mipMapBias=flow?0:-.35f;
                importer.SaveAndReimport();
            }
            Directory.CreateDirectory("Assets/Scenes");
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight=Color.black;RenderSettings.defaultReflectionMode=UnityEngine.Rendering.DefaultReflectionMode.Custom;
            Lightmapping.realtimeGI=false;Lightmapping.bakedGI=false;
            new GameObject("Dashing native game",typeof(GameHost));
            EditorSceneManager.SaveScene(scene,"Assets/Scenes/Dashing.unity");
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/Scenes/Dashing.unity",true)};
            AssetDatabase.SaveAssets();Debug.Log("DASHING_PROJECT_PREPARED");
        }
        [MenuItem("Dashing/Validate Native Rules")]
        public static void Validate()
        {
            var result=RuleChecks.Run();Directory.CreateDirectory("TestResults");
            File.WriteAllText("TestResults/rule-checks.txt",result);
            Debug.Log(result);
            var presentation=PresentationChecks.Run();File.WriteAllText("TestResults/presentation-checks.txt",presentation);Debug.Log(presentation);
            var clarity=RinClarityChecks.Run();File.WriteAllText("TestResults/rin-clarity-checks.txt",clarity);Debug.Log(clarity);
            var keys=KeyBindingChecks.Run();File.WriteAllText("TestResults/key-binding-checks.txt",keys);Debug.Log(keys);
        }
        [MenuItem("Dashing/Build Windows Player")]
        public static void BuildWindows()
        {
            Prepare();Validate();Directory.CreateDirectory("Builds/Windows");
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/Scenes/Dashing.unity"},locationPathName="Builds/Windows/Dashing.exe",target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});
            File.WriteAllText("TestResults/build-report.json","{\"result\":\""+report.summary.result+"\",\"errors\":"+report.summary.totalErrors+",\"warnings\":"+report.summary.totalWarnings+",\"bytes\":"+report.summary.totalSize+"}");
            if(report.summary.result!=BuildResult.Succeeded||report.summary.totalErrors>0)
                throw new Exception("Windows build failed: "+report.summary.result+", "+report.summary.totalErrors+" errors");
            Debug.Log("DASHING_WINDOWS_BUILD_PASS");
        }
    }
}
