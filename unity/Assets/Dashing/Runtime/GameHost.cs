using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    [DefaultExecutionOrder(-100)]
    public sealed class GameHost : MonoBehaviour
    {
        public Game Game {get;private set;}
        public Character SelectedCharacter {get;private set;}
        public int Difficulty {get;private set;}
        public int Best {get;private set;}
        public bool RefinedRin {get;private set;}
        private Camera gameCamera;
        private Stage stage;
        private GameUI ui;
        public MusicMode Music {get;private set;}
        public void OpenMusic(){if(Game.S.Phase==Phase.Menu)Music.Open();}
        public void SetMusicUI(bool active){ui.SetVisible(!active);}
        public void ResetMusicStage(GameState state){stage.Reset(state);}
        public bool MusicCharacterVisible {get {return stage.CharacterVisible;}}
        public void MusicCue(Cue cue,GameState state){stage.Cue(cue,state);if(cue.Kind==CueKind.Hurt)audioSource.PlayOneShot(hurt);else if(cue.Kind==CueKind.Hit)audioSource.PlayOneShot(cue.Critical?critical:hit);}
        private AudioSource audioSource;
        private AudioClip hit,critical,hurt;
        private int screenW,screenH,keyLayout;
        private int mouseHoldButton=-1;
        private Phase previousPhase;
        private bool smoke;
        private bool clarity;
        private bool horizontal;
        private bool inputProbe;
        private float probeTimer;
        private float feverVisual;
        private readonly List<string> presentationResults=new List<string>();
        public RailKeyBindings Keys {get;private set;}
        public string KeyDescription {get {return Keys.Describe();}}
        public string PointerDescription {get {return horizontal?"左半屏上轨 / 右半屏下轨":"上半屏上轨 / 下半屏下轨";}}
        public bool Horizontal {get {return horizontal;}}
        private string BestKey {get {return "dashing.best."+SelectedCharacter+"."+Difficulty;}}
        public float FeverVisual {get {return feverVisual;}}
        private void Awake()
        {
            Application.targetFrameRate=240;Application.runInBackground=false;
            QualitySettings.vSyncCount=0;QualitySettings.maxQueuedFrames=1;
            QualitySettings.antiAliasing=4;
            SelectedCharacter=(Character)Mathf.Clamp(PlayerPrefs.GetInt("dashing.character",1),0,1);
            Difficulty=Mathf.Clamp(PlayerPrefs.GetInt("dashing.difficulty",1),1,4);keyLayout=Mathf.Clamp(PlayerPrefs.GetInt("dashing.keys",0),0,2);
            clarity=Array.IndexOf(Environment.GetCommandLineArgs(),"--dashing-clarity")>=0;
            smoke=clarity||Array.IndexOf(Environment.GetCommandLineArgs(),"--dashing-smoke")>=0;
            RefinedRin=smoke||PlayerPrefs.GetInt("dashing.rinClarity",1)==1;
            inputProbe=Array.IndexOf(Environment.GetCommandLineArgs(),"--dashing-input-check")>=0||Array.IndexOf(Environment.GetCommandLineArgs(),"--dashing-music-input-check")>=0||Array.IndexOf(Environment.GetCommandLineArgs(),"--dashing-music-smoke")>=0;
            horizontal=PlayerPrefs.GetInt("dashing.pointer",0)==1;
            if(!smoke&&!inputProbe&&!PlayerPrefs.HasKey("dashing.settingsVersion"))
            {
                SelectedCharacter=Character.Rin;Difficulty=1;keyLayout=0;horizontal=false;
                PlayerPrefs.SetInt("dashing.settingsVersion",1);PlayerPrefs.SetInt("dashing.character",1);PlayerPrefs.SetInt("dashing.difficulty",1);
                PlayerPrefs.SetInt("dashing.keys",0);PlayerPrefs.SetInt("dashing.pointer",0);PlayerPrefs.Save();
            }
            if(smoke){SelectedCharacter=Character.Rin;Difficulty=3;Application.runInBackground=true;}
            Keys=smoke||inputProbe?new RailKeyBindings():RailKeyBindings.Load(PlayerPrefs.GetString("dashing.customKeys",""),keyLayout);
            if(smoke)Application.logMessageReceived+=OnSmokeLog;
            Game=new Game(12345,Difficulty,SelectedCharacter);Game.S.Phase=Phase.Menu;Best=PlayerPrefs.GetInt(BestKey,0);
            var cam=new GameObject("2D Camera",typeof(Camera),typeof(AudioListener));cam.transform.SetParent(transform,false);gameCamera=cam.GetComponent<Camera>();
            gameCamera.orthographic=true;gameCamera.clearFlags=CameraClearFlags.SolidColor;gameCamera.backgroundColor=new Color(.025f,.045f,.085f);gameCamera.nearClipPlane=.1f;gameCamera.farClipPlane=100;
            stage=new Stage(transform);stage.SetRinQuality(RefinedRin);Resize();stage.Reset(Game.S);ui=new GameUI(this);
            audioSource=gameObject.AddComponent<AudioSource>();audioSource.playOnAwake=false;audioSource.volume=.35f;
            hit=Tone(440,.07f);critical=Tone(880,.11f);hurt=Tone(95,.15f);
            Music=gameObject.AddComponent<MusicMode>();Music.Initialize(this);
            if(clarity)gameObject.AddComponent<RinClarityPreview>().Begin(this);
            else if(smoke)StartCoroutine(SmokeTest());
        }
        private static AudioClip Tone(float hz,float duration)
        {
            const int rate=22050;int n=(int)(duration*rate);var samples=new float[n];
            for(int i=0;i<n;i++){float t=(float)i/rate;samples[i]=(Mathf.Sin(2*Mathf.PI*hz*t)+.25f*Mathf.Sin(4*Mathf.PI*hz*t))*.4f*Mathf.Pow(1-(float)i/n,2);}
            var clip=AudioClip.Create("Native hit "+hz,n,1,rate,false);clip.SetData(samples,0);return clip;
        }
        private void Resize()
        {
            screenW=Screen.width;screenH=Screen.height;double aspect=(double)Math.Max(screenW,1)/Math.Max(screenH,1);
            double h=aspect>=1?720:720/aspect,w=h*aspect;Game.Resize(new Layout(w,h));
            gameCamera.orthographicSize=(float)h/200;gameCamera.transform.localPosition=new Vector3((float)w/200,-(float)h/200,-10);
            if(Music!=null)Music.Resize(Game.S.Layout);
        }
        public void StartOrResume()
        {
            if(Game.S.Phase==Phase.Running)return;
            if(Game.S.Phase==Phase.Paused){Game.Resume();return;}
            Best=PlayerPrefs.GetInt(BestKey,0);
            var layout=Game.S.Layout;Game=new Game(smoke?12345u:(uint)Environment.TickCount,Difficulty,SelectedCharacter,layout);stage.Reset(Game.S);feverVisual=0;mouseHoldButton=-1;
            if(!smoke&&!inputProbe){PlayerPrefs.SetInt("dashing.character",(int)SelectedCharacter);PlayerPrefs.SetInt("dashing.difficulty",Difficulty);PlayerPrefs.Save();}
        }
        public void TogglePause(){if(Game.S.Phase==Phase.Running)Game.Pause();else if(Game.S.Phase==Phase.Paused)Game.Resume();}
        public void ToggleFullscreen(){Screen.fullScreen=!Screen.fullScreen;}
        public void ToggleRinQuality()
        {
            RefinedRin=!RefinedRin;stage.SetRinQuality(RefinedRin);
            if(!smoke&&!inputProbe){PlayerPrefs.SetInt("dashing.rinClarity",RefinedRin?1:0);PlayerPrefs.Save();}
        }
        public void SelectCharacter(){if(Game.S.Phase==Phase.Paused)return;SelectedCharacter=SelectedCharacter==Character.Rin?Character.Zhe:Character.Rin;Preview();}
        public void SelectDifficulty(){if(Game.S.Phase==Phase.Paused)return;Difficulty=Difficulty%4+1;Preview();}
        public void SetKeyPreset(int preset){keyLayout=preset;Keys.SetPreset(preset);SaveKeys();}
        public void SaveKeys(){if(!smoke&&!inputProbe){PlayerPrefs.SetString("dashing.customKeys",Keys.Serialize());PlayerPrefs.SetInt("dashing.keys",keyLayout);PlayerPrefs.Save();}}
        public void TogglePointer(){horizontal=!horizontal;if(!smoke&&!inputProbe){PlayerPrefs.SetInt("dashing.pointer",horizontal?1:0);PlayerPrefs.Save();}}
        private Lane PointerLane(Vector2 position){return horizontal?(position.x<Screen.width*.5f?Lane.Top:Lane.Bottom):(position.y>Screen.height*.5f?Lane.Top:Lane.Bottom);}
        private void Preview(){if(Game.S.Phase==Phase.Menu){Game=new Game(12345,Difficulty,SelectedCharacter,Game.S.Layout);Game.S.Phase=Phase.Menu;stage.Reset(Game.S);}Best=PlayerPrefs.GetInt(BestKey,0);}
        public void ExitOrMenu()
        {
            if(Game.S.Phase==Phase.Menu){Application.Quit();return;}
            SaveBest();Game=new Game(12345,Difficulty,SelectedCharacter,Game.S.Layout);Game.S.Phase=Phase.Menu;stage.Reset(Game.S);feverVisual=0;
        }
        private void SaveBest()
        {
            if(smoke||inputProbe){Best=Math.Max(Best,Game.S.Score);return;}
            string key="dashing.best."+Game.S.Character+"."+Game.S.Difficulty;
            if(Game.S.Score>PlayerPrefs.GetInt(key,0)){PlayerPrefs.SetInt(key,Game.S.Score);PlayerPrefs.Save();}
            Best=PlayerPrefs.GetInt(BestKey,0);
        }
        private void Update()
        {
            if(Screen.width!=screenW||Screen.height!=screenH)Resize();
            if(Music!=null&&Music.Active){float musicDt=Mathf.Min(Time.unscaledDeltaTime,.05f);Music.Tick(musicDt);return;}
            if(!smoke)ReadInput();
            float dt=Mathf.Min(Time.unscaledDeltaTime,.05f);Game.Tick(dt);
            foreach(var cue in Game.Cues){stage.Cue(cue,Game.S);ui.ShowCue(cue);if(cue.Kind==CueKind.Hurt)audioSource.PlayOneShot(hurt);else if(cue.Kind==CueKind.Hit||cue.Kind==CueKind.Pair||cue.Kind==CueKind.Hold)audioSource.PlayOneShot(cue.Critical?critical:hit);}
            Game.Cues.Clear();
            // No event can leave a post effect stuck: FEVER glow follows authoritative state.
            float target=Game.S.Fever&&Game.S.Phase!=Phase.Over?1:0;
            if(Game.S.Phase!=Phase.Paused)feverVisual=Mathf.MoveTowards(feverVisual,target,dt/.35f);
            gameCamera.backgroundColor=Color.Lerp(new Color(.025f,.045f,.085f),new Color(.12f,.055f,.08f),feverVisual);
            if(Game.S.Phase==Phase.Over&&previousPhase!=Phase.Over)SaveBest();previousPhase=Game.S.Phase;
            if(inputProbe){probeTimer-=Time.unscaledDeltaTime;if(probeTimer<=0){probeTimer=.1f;WriteProbe();}}
        }
        private void LateUpdate()
        {
            // UGUI pointer-down runs during Update. Draw after it so mouse and keyboard
            // rail changes both reach the camera in the same frame.
            float dt=Mathf.Min(Time.unscaledDeltaTime,.05f);
            if(Music!=null&&Music.Active){Music.UI.Tick();stage.Draw(Music.View,dt,Music.Screen==MusicScreen.Recording);return;}
            stage.Draw(Game.S,dt);ui.Update(dt);
        }
        private void ReadInput()
        {
            if(ui.HandleKeyInput())return;
            if(Input.GetKeyDown(KeyCode.F11))ToggleFullscreen();
            if(Input.GetKeyDown(KeyCode.F8))ToggleRinQuality();
            if(Input.GetKeyDown(KeyCode.P)||Input.GetKeyDown(KeyCode.Escape)){TogglePause();return;}
            if(Game.S.Phase!=Phase.Running){if(Input.GetKeyDown(KeyCode.Return)||Input.GetKeyDown(KeyCode.Space))StartOrResume();return;}
            for(int i=0;i<2;i++)for(int k=0;k<Keys.Count((Lane)i);k++)
            {var key=Keys.Get((Lane)i,k);string id="key:"+key;if(Input.GetKeyDown(key))Game.Press((Lane)i,id);if(Input.GetKeyUp(key))Game.Release(id);}
            if(Input.touchCount>0)
            {
                foreach(var t in Input.touches){string id="touch:"+t.fingerId;if(t.phase==TouchPhase.Began&&!PointerOverUI(t.fingerId))Game.Press(PointerLane(t.position),id);if(t.phase==TouchPhase.Ended||t.phase==TouchPhase.Canceled)Game.Release(id);}
            }
            else
            {
                for(int b=0;b<2;b++){if(Input.GetMouseButtonDown(b)&&!ui.IsPointerOnUI){Game.Press(PointerLane(Input.mousePosition),"mouse:"+b);mouseHoldButton=b;}if(Input.GetMouseButtonUp(b)){Game.Release("mouse:"+b);if(mouseHoldButton==b)mouseHoldButton=-1;}}
            }
        }
        private static bool PointerOverUI(int id){return UnityEngine.EventSystems.EventSystem.current!=null&&UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject(id);}
        private void OnApplicationFocus(bool focus){if(!focus&&Music!=null&&Music.Active){if(Music.Running&&!Music.Paused)Music.TogglePause();return;}if(!focus&&Game!=null&&!smoke)Game.Pause();}
        private void OnApplicationPause(bool pause){if(pause&&Music!=null&&Music.Active){if(Music.Running&&!Music.Paused)Music.TogglePause();return;}if(pause&&Game!=null&&!smoke)Game.Pause();}
        private void OnApplicationQuit(){if(Game!=null)SaveBest();}
        private void OnDestroy(){if(smoke)Application.logMessageReceived-=OnSmokeLog;}
        private void OnSmokeLog(string message,string stack,LogType type)
        {
            if(type!=LogType.Exception&&type!=LogType.Error&&type!=LogType.Assert)return;
            Application.logMessageReceived-=OnSmokeLog;
            string dir=Path.GetFullPath(Path.Combine(Application.dataPath,clarity?"../../../TestResults/RinClarity":"../../../TestResults/Player"));Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir,clarity?"native-preview.json":"player-smoke.json"),"{\"passed\":false,\"error\":\""+message.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\n"," ").Replace("\r"," ")+"\"}");
            Application.Quit(1);
        }
        private void WriteProbe()
        {
            string dir=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../TestResults"));Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir,"input-probe.json"),"{\"phase\":\""+Game.S.Phase+"\",\"lane\":\""+Game.S.PlayerLane+"\",\"now\":"+Game.S.Now.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+",\"difficulty\":"+Difficulty+",\"character\":\""+SelectedCharacter+"\",\"width\":"+Screen.width+",\"height\":"+Screen.height+",\"rinRefined\":"+RefinedRin.ToString().ToLowerInvariant()+",\"keyEditor\":"+ui.KeyEditorOpen.ToString().ToLowerInvariant()+",\"listening\":"+ui.Listening.ToString().ToLowerInvariant()+",\"keyError\":"+ui.KeyError.ToString().ToLowerInvariant()+",\"bindings\":"+Keys.Serialize()+"}");
        }

        // Real player validation, enabled only by an explicit command line flag.
        private IEnumerator SmokeTest()
        {
            string folder=Path.Combine(Application.dataPath,"../../../TestResults/Player");Directory.CreateDirectory(folder);
            yield return new WaitForSecondsRealtime(.8f);yield return Capture(folder,"01-menu.png");
            yield return PresentationSmoke(folder);
            ExitOrMenu();
            StartOrResume();
            float elapsed=0;int frames=0;bool didPause=false;bool sawHold=false,sawPair=false,sawBurn=false,sawFever=false;
            while(elapsed<28)
            {
                var s=Game.S;
                foreach(var m in s.Monsters)
                {
                    if(m.Removed||m.Escaped)continue;
                    if(m.Kind==MonsterKind.Hold)
                    {if(m.HeadX<=s.Layout.HitX+8&&m.HeadX>=s.Layout.HitX-s.Layout.ZoneHalf&&s.HoldId==0){Game.Press(m.Lane,"smoke-hold");sawHold=true;}}
                    else if(!m.PairPending&&Math.Abs(m.X-s.Layout.HitX)<10){Game.Press(m.Lane,"smoke:"+m.Lane);if(m.Kind==MonsterKind.Twin)sawPair=true;}
                }
                sawBurn|=s.Burning;sawFever|=s.Fever;
                if(!didPause&&elapsed>5){Game.Pause();double now=s.Now;yield return new WaitForSecondsRealtime(.2f);if(s.Now!=now)throw new Exception("Paused clock advanced");yield return Capture(folder,"03-pause.png");Game.Resume();didPause=true;}
                if(frames==120)yield return Capture(folder,"02-playing.png");
                elapsed+=Mathf.Min(Time.unscaledDeltaTime,.05f);frames++;yield return null;
            }
            // Exercise the long hold and proxy explicitly; natural spawning can delay it.
            Game.S.Monsters.Clear();Game.S.SpawnTimer=999;Game.CancelHold();
            var held=Game.SpawnLong(Lane.Bottom);held.X=Game.S.Layout.HitX-held.H*.46;Game.Press(Lane.Bottom,"smoke-hold");
            var target=Game.SpawnNormal(Lane.Top);target.X=Game.S.Layout.HitX;Game.Press(Lane.Top,"smoke-soul");
            if(Game.S.HoldId!=held.Id||!target.Removed)throw new Exception("Native hold/soul failed");
            yield return Capture(folder,"04-hold-soul.png");yield return WaitVisual(.5f);
            VisualCheck(stage.Motion.HoldActive&&stage.Motion.Holding&&stage.Rin.Pose=="hold","Hold switches from initial attack into looping swings");
            Game.Pause();yield return null;
            VisualCheck(stage.Motion.HoldActive&&!stage.Motion.Holding&&stage.Rin.Pose=="hold-wait","Paused anchored hold waits with raised scythe");
            yield return Capture(folder,"17-hold-wait.png");
            Game.Resume();Game.Press(Lane.Bottom,"smoke-hold");yield return WaitVisual(1.65f);
            if(!held.Removed||Game.S.HoldId!=0)throw new Exception("Native hold completion failed");
            // Force representative visual states after exercising natural play.
            Game.S.Fever=true;Game.S.FeverT=.15;Game.S.Burning=true;Game.S.Hp=245;
            yield return Capture(folder,"05-fever.png");yield return new WaitForSecondsRealtime(.7f);
            if(Game.S.Fever||feverVisual>.001f||stage.FeverEffectsVisible)throw new Exception("FEVER presentation did not clear");
            yield return Capture(folder,"06-after-fever.png");
            Game.Pause();yield return Capture(folder,"07-native-scene.png");
            Game.Resume();Game.S.Monsters.Clear();Game.S.Character=Character.Zhe;Game.S.Hp=Game.S.MaxHp=300;Game.S.Burning=false;
            Game.Press(Lane.Bottom,"smoke-zhe");yield return Capture(folder,"08-zhe.png");
            Screen.SetResolution(720,1000,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.8f);yield return Capture(folder,"09-portrait.png");
            Screen.SetResolution(1280,720,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.6f);
            Game.S.Hp=20;var fatal=Game.SpawnNormal(Game.S.PlayerLane);fatal.X=0;Game.Tick(.01);yield return Capture(folder,"10-game-over.png");
            if(Game.S.Phase!=Phase.Over)throw new Exception("Native game over failed");
            int finalScore=Game.S.Score,finalKills=Game.S.Kills;
            ExitOrMenu();StartOrResume();if(Game.S.Phase!=Phase.Running||Game.S.Score!=0)throw new Exception("Native restart failed");
            File.WriteAllText(Path.Combine(folder,"player-smoke.json"),"{\"passed\":true,\"frames\":"+frames+",\"score\":"+finalScore+",\"kills\":"+finalKills+",\"pausedClockFrozen\":true,\"feverCleared\":true,\"holdAndSoul\":true,\"gameOverAndRestart\":true,\"resized\":true,\"naturalHold\":"+sawHold.ToString().ToLowerInvariant()+",\"naturalPair\":"+sawPair.ToString().ToLowerInvariant()+",\"naturalBurn\":"+sawBurn.ToString().ToLowerInvariant()+",\"naturalFever\":"+sawFever.ToString().ToLowerInvariant()+"}");
            File.WriteAllLines(Path.Combine(folder,"character-presentation.txt"),presentationResults);
            Debug.Log("DASHING_PLAYER_SMOKE_PASS");Application.Quit(0);
        }
        private void VisualCheck(bool ok,string text)
        {
            if(!ok)throw new Exception("NATIVE_PRESENTATION_FAILED: "+text);
            presentationResults.Add("PASS "+text);
        }
        private IEnumerator WaitVisual(float duration)
        {
            float target=stage.Motion.Clock+duration,deadline=Time.realtimeSinceStartup+Mathf.Max(5,duration*5);
            while(stage.Motion.Clock<target)
            {
                if(Time.realtimeSinceStartup>deadline)throw new Exception("Native visual clock stopped");
                yield return null;
            }
        }
        private IEnumerator PresentationSmoke(string folder)
        {
            StartOrResume();Game.S.SpawnTimer=999;
            yield return WaitVisual(.08f);
            VisualCheck(stage.Rin.IsRiding&&stage.Rin.Pose=="ride","Rin rides on the lower rail during normal play");
            VisualCheck(stage.Rin.Refined&&stage.Rin.UsingMotion,"Refined textures and offline motion maps are active in gameplay");
            yield return Capture(folder,"11-ground-ride-a.png");int frame=stage.Rin.FrameFrom;float mix=stage.Rin.FrameMix;
            yield return WaitVisual(.17f);
            VisualCheck(stage.Rin.IsRiding&&(stage.Rin.FrameFrom!=frame||Mathf.Abs(stage.Rin.FrameMix-mix)>.1f),"Ground riding frames advance and blend");
            yield return Capture(folder,"12-ground-ride-b.png");
            Game.Pause();float clock=stage.Motion.Clock;frame=stage.Rin.FrameFrom;mix=stage.Rin.FrameMix;
            yield return new WaitForSecondsRealtime(.2f);
            VisualCheck(stage.Rin.IsRiding&&stage.Motion.Clock==clock&&stage.Rin.FrameFrom==frame&&stage.Rin.FrameMix==mix,"Pause freezes the riding frame without switching to standing");
            ToggleRinQuality();yield return null;VisualCheck(!stage.Rin.Refined&&!stage.Rin.UsingMotion&&stage.Rin.FrameFrom==frame&&stage.Rin.FrameMix==mix,"Original rendering switch preserves the frozen pose");
            ToggleRinQuality();yield return null;VisualCheck(stage.Rin.Refined&&stage.Rin.UsingMotion&&stage.Rin.FrameFrom==frame&&stage.Rin.FrameMix==mix,"Refined rendering switch restores the same pose");
            Game.Resume();
            foreach(Character character in new[]{Character.Rin,Character.Zhe})
            {
                Game.S.Character=character;
                for(int i=0;i<12;i++)
                {
                    Lane rail=i%2==0?Lane.Top:Lane.Bottom;int inputFrame=Time.frameCount;
                    Game.Press(rail,"visual-fast-rail");yield return new WaitForEndOfFrame();
                    VisualCheck(Time.frameCount==inputFrame&&Math.Abs(stage.Motion.Y-Game.S.Layout.Y(rail))<.001&&
                        Math.Abs(stage.Motion.BodyY-Game.S.Layout.Y(rail))<Game.S.Layout.PlayerR*.15,
                        character+" rail switch renders in input frame "+i);
                    yield return null;
                }
            }
            Game.S.Character=Character.Rin;Game.Press(Lane.Top,"visual-jump");yield return new WaitForEndOfFrame();
            VisualCheck(!stage.Rin.IsRiding&&Math.Abs(stage.Motion.Y-Game.S.Layout.Y(Lane.Top))<.001,"Upper attack reaches upper rail in the input frame");
            yield return Capture(folder,"13-jump-apex.png");
            Game.Press(Lane.Bottom,"visual-fall");yield return new WaitForEndOfFrame();
            VisualCheck(!stage.Motion.Airborne&&Math.Abs(stage.Motion.Y-Game.S.Layout.Y(Lane.Bottom))<.001,"Downward attack reaches lower rail in the input frame");
            yield return WaitVisual(.65f);VisualCheck(stage.Rin.IsRiding,"Riding resumes after an interrupted jump lands");
            Game.SpawnPair();foreach(var m in Game.S.Monsters)m.X=Game.S.Layout.HitX;
            Game.Press(Lane.Top,"visual-pair-top");Game.Press(Lane.Bottom,"visual-pair-bottom");
            yield return WaitVisual(.3f);
            VisualCheck(stage.Motion.PairP>0&&stage.Motion.BodyY<stage.Motion.Y-Game.S.Layout.PlayerR*2,"Twin finish visibly lifts the character before the slam");
            yield return Capture(folder,"14-twin-jump.png");yield return WaitVisual(.5f);
            Game.S.Hp=245;Game.S.Burning=true;Game.S.Fever=true;Game.S.FeverT=.9;
            yield return WaitVisual(.12f);VisualCheck(stage.Rin.IsRiding&&stage.FeverEffectsVisible,"Burn and FEVER layer over ground riding");
            yield return Capture(folder,"15-burning-ride.png");
            Game.Press(Lane.Bottom,"visual-burn-swing");yield return WaitVisual(.12f);
            VisualCheck(stage.Rin.Pose=="attack"&&!stage.Rin.IsRiding,"Burn attack uses the attack sequence");
            yield return Capture(folder,"16-burning-swing.png");yield return WaitVisual(1.2f);
            VisualCheck(!Game.S.Fever&&!stage.FeverEffectsVisible,"New FEVER arcs also fully disappear after expiry");
        }
        private static IEnumerator Capture(string folder,string name)
        {
            yield return null;yield return new WaitForEndOfFrame();var tex=ScreenCapture.CaptureScreenshotAsTexture();
            var pixels=tex.GetPixels32();int visible=0;for(int i=0;i<pixels.Length;i+=97){var c=pixels[i];if(c.r>20||c.g>25||c.b>40)visible++;}
            if(visible<50){Destroy(tex);throw new Exception("Native screenshot is blank: "+name);}
            File.WriteAllBytes(Path.Combine(folder,name),tex.EncodeToPNG());Destroy(tex);
        }
    }
}
