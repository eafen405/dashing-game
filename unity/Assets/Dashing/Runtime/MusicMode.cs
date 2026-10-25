using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;
using Dashing.Core;

namespace Dashing.Unity
{
    public enum MusicScreen { Library, Loading, Ready, Recording, CharacterSelect, Playing, Review, Results }

    public sealed class MusicMode : MonoBehaviour
    {
        public bool Active { get; private set; }
        public MusicScreen Screen { get; private set; }
        public GameState View { get; private set; }
        public ChartRecorder Recorder { get; private set; }
        public RhythmSession Session { get; private set; }
        public RhythmBattle Battle {get;private set;}
        public Character SelectedCharacter {get;private set;}
        public MusicChart Chart { get; private set; }
        public MusicLevelStore Store { get; private set; }
        public List<MusicLevel> Levels { get; private set; } = new List<MusicLevel>();
        public string Status { get; private set; } = "导入 MP3，跟着音乐点击上下轨道，录成自己的关卡。";
        public string Feedback { get; private set; } = "";
        public bool Draft { get; private set; }
        public bool Dirty { get; private set; }
        public bool ConfirmDiscard { get; private set; }
        public bool Paused { get { return clock != null && clock.Paused; } }
        public bool Running { get { return Screen == MusicScreen.Recording || Screen == MusicScreen.Playing; } }
        public double SongTime { get { return Running ? clock.Time : 0; } }
        public double Duration { get { return Chart == null ? 0 : Chart.duration; } }
        public int OffsetMs { get; private set; }
        public int Page { get; private set; }
        public bool RecordTwins { get; private set; }
        public GameHost Host { get; private set; }
        public MusicModeUI UI { get; private set; }
        private MusicAudio clock;
        private AudioClip clip;
        private string audioPath;
        private MusicScreen returnScreen;
        private readonly Dictionary<int, Monster> visible = new Dictionary<int, Monster>();
        private readonly List<int> staleVisuals = new List<int>();
        private int nextVisual;
        private readonly Dictionary<string, Lane> activeInputs = new Dictionary<string, Lane>();
        private readonly List<string> pausedReleases = new List<string>();
        private float feedbackLeft;
        private bool isSmoke;
        private bool inputCheck, restartPending;
        private float probeTimer;
        public void Initialize(GameHost host)
        {
            Host = host;
            SelectedCharacter=host.SelectedCharacter;
            inputCheck = Array.IndexOf(Environment.GetCommandLineArgs(), "--dashing-music-input-check") >= 0;
            bool autoSmoke = Array.IndexOf(Environment.GetCommandLineArgs(), "--dashing-music-smoke") >= 0;
            isSmoke = autoSmoke || inputCheck;
            Store = new MusicLevelStore(isSmoke ? Path.Combine(Application.temporaryCachePath, "DashingMusicSmoke-" + Guid.NewGuid().ToString("N")) : Path.Combine(Application.persistentDataPath, "MusicLevels"));
            string[] args = Environment.GetCommandLineArgs(); int testIndex = Array.IndexOf(args, "--music-test-id"); Guid testId;
            if (inputCheck && testIndex >= 0 && testIndex + 1 < args.Length && Guid.TryParseExact(args[testIndex + 1], "N", out testId))
                Store = new MusicLevelStore(Path.GetFullPath(Path.Combine(Application.dataPath, "../../../TestResults/Music/Library-" + testId.ToString("N"))));
            OffsetMs = isSmoke ? 0 : Mathf.Clamp(PlayerPrefs.GetInt("dashing.music.offsetMs", 0), -250, 250);
            clock = new MusicAudio(gameObject.AddComponent<AudioSource>());
            ResetView(Phase.Menu); UI = new MusicModeUI(this); UI.Show(false);
            if (isSmoke) Application.runInBackground = true;
            if (autoSmoke) StartCoroutine(MusicModeSmoke.Run(this));
        }
        public void Open()
        {
            Active = true; Host.SetMusicUI(true); UI.Show(true); Screen = MusicScreen.Library; RefreshLibrary();
        }
        public void Close()
        {
            if (Dirty) { restartPending = false; ConfirmDiscard = true; Status = "当前录谱尚未保存。可以保存为关卡，也可以确认放弃。"; return; }
            clock.Stop(); Active = false; ConfirmDiscard = false; ReleaseClip(); UI.Show(false); Host.SetMusicUI(false); Host.ResetMusicStage(Host.Game.S);
        }
        public void RefreshLibrary()
        {
            try { int skipped; Levels = Store.Load(out skipped); Page = Mathf.Clamp(Page, 0, Math.Max(0, (Levels.Count - 1) / 5));
                Status = skipped > 0 ? "已载入 " + Levels.Count + " 个关卡；跳过 " + skipped + " 个损坏或缺失音频的关卡。" : Levels.Count == 0 ? "还没有自制关卡。导入 MP3 开始第一次录谱。" : "已保存 " + Levels.Count + " 个关卡，选择一个即可游玩。"; }
            catch (Exception e) { Status = "无法读取关卡库：" + e.Message; }
            UI.Rebuild();
        }
        public void ChangePage(int delta) { Page = Mathf.Clamp(Page + delta, 0, Math.Max(0, (Levels.Count - 1) / 5)); UI.Rebuild(); }
        public void PickFile()
        {
            try { string path = MusicFilePicker.Pick(); if (!string.IsNullOrEmpty(path)) { UI.PathText = path; Import(path); } }
            catch (Exception e) { Status = e.Message; }
        }
        public void Import(string path)
        {
            if (Screen == MusicScreen.Loading || Running) return;
            if (Dirty) { Status = "请先保存或放弃当前录谱。"; return; }
            try { path = Path.GetFullPath((path ?? "").Trim().Trim('"')); MusicLevelStore.CheckAudio(path); }
            catch (Exception e) { Status = "导入失败：" + e.Message; return; }
            StartCoroutine(LoadAudio(path, null));
        }
        public void PlayLevel(int index)
        {
            if (index < 0 || index >= Levels.Count || Screen == MusicScreen.Loading || Running) return;
            if (Dirty) { Status = "请先保存或放弃当前录谱。"; return; }
            var level = Levels[index]; StartCoroutine(LoadAudio(level.AudioPath, level.Chart));
        }
        private IEnumerator LoadAudio(string path, MusicChart saved)
        {
            Screen = MusicScreen.Loading; Status = "正在解码 MP3，请稍候…"; UI.Rebuild();
            AudioClip loaded = null; string failure = null;
            using (var request = UnityWebRequestMultimedia.GetAudioClip(new Uri(path).AbsoluteUri, AudioType.MPEG))
            {
                request.timeout = 60; ((DownloadHandlerAudioClip)request.downloadHandler).streamAudio = false;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success) failure = request.error;
                else { try { loaded = DownloadHandlerAudioClip.GetContent(request); } catch (Exception e) { failure = e.Message; } }
            }
            if (loaded == null || loaded.length <= 0 || loaded.length > 1800)
            {
                if (loaded != null) Destroy(loaded); Screen = MusicScreen.Library;
                Status = "导入失败：" + (failure ?? "MP3 无法解码或时长超过 30 分钟。"); UI.Rebuild(); yield break;
            }
            if (saved != null && Math.Abs(saved.duration - loaded.length) > .15)
            { Destroy(loaded); Screen = MusicScreen.Library; Status = "关卡音频时长与谱面不一致，请检查音频文件。"; UI.Rebuild(); yield break; }
            ReleaseClip(); clip = loaded; audioPath = path; Draft = saved == null; Dirty = false; ConfirmDiscard = false;
            Recorder = new ChartRecorder(); Session = null; Battle=null;
            RecordTwins = false;
            Chart = saved == null ? new MusicChart { title = Path.GetFileNameWithoutExtension(path).Substring(0, Math.Min(60, Path.GetFileNameWithoutExtension(path).Length)), duration = loaded.length } : saved.Copy();
            UI.TitleText = Chart.title;
            Screen = MusicScreen.Ready; Status = Draft ? "音乐已导入。开始后有 2 秒倒计时，点击时间将按音乐原样记录。" : "已加载关卡，可以开始游玩。";
            ResetView(Phase.Menu); UI.Rebuild();
            if (!Draft) StartPlay();
        }
        public void StartRecording()
        {
            if (clip == null || !Draft || Running || (Recorder != null && Recorder.Notes.Count > 0)) return;
            Recorder = new ChartRecorder(); Chart.notes.Clear(); Session = null; Battle=null; Feedback = "点击后，怪物从中央记录点向左移出";
            StartRun(MusicScreen.Recording);
        }
        public void RestartRecording()
        {
            if (!Draft || clip == null) return;
            if (Recorder.Notes.Count == 0) { StartRecording(); return; }
            restartPending = true; ConfirmDiscard = true; Status = "确认重新录制？当前音符将被清除。"; UI.Rebuild();
        }
        public void AcceptDiscard()
        {
            if (!ConfirmDiscard) return;
            if (!restartPending) { Discard(); return; }
            Recorder = new ChartRecorder(); Chart.notes.Clear(); Dirty = false; ConfirmDiscard = restartPending = false; StartRecording();
        }
        public void StartPlay()
        {
            if (clip == null || Chart == null || Running) return;
            if (Draft) { SyncDraft(); Chart.title = UI.TitleText; }
            try { Chart.Validate(); } catch (Exception e) { Status = e.Message; return; }
            returnScreen = Draft ? MusicScreen.Review : MusicScreen.Library;
            Screen=MusicScreen.CharacterSelect;Status="选择角色后开始游玩；回血、燃魂、FEVER 与漏怪规则沿用生存模式。";ResetView(Phase.Menu);UI.Rebuild();
        }
        public void SelectCharacter(Character character)
        {
            if(Screen!=MusicScreen.CharacterSelect)return;
            SelectedCharacter=character;ResetView(Phase.Menu);UI.Rebuild();
        }
        public void BeginPlay()
        {
            if(Screen!=MusicScreen.CharacterSelect||clip==null)return;
            try { Battle=new RhythmBattle(Chart,SelectedCharacter,Host.Game.S.Layout);Session=Battle.Session; }
            catch(Exception e){Status=e.Message;return;}
            Feedback = "准备演奏"; StartRun(MusicScreen.Playing);
        }
        private void StartRun(MusicScreen screen)
        {
            activeInputs.Clear(); pausedReleases.Clear();
            Screen = screen; ConfirmDiscard = false; Status = ""; feedbackLeft = 1; ResetView(Phase.Running); clock.Start(clip); UI.Rebuild();
        }
        public void TogglePause()
        {
            if (!Running) return;
            if (Paused)
            {
                clock.Resume(); View.Phase = Phase.Running;
                foreach (string input in pausedReleases) ReleasePlaying(input);
                pausedReleases.Clear();
            }
            else { clock.Pause(); View.Phase = Phase.Paused; }
            UI.Rebuild();
        }
        public void StopRun()
        {
            if (!Running) return;
            if (Screen == MusicScreen.Recording) Recorder.Finish(clock.Time - OffsetMs / 1000.0, Chart.duration);
            activeInputs.Clear(); pausedReleases.Clear();
            clock.Stop(); View.Phase = Phase.Menu;
            if (Screen == MusicScreen.Recording) { SyncDraft(); Screen = MusicScreen.Review; Status = "录制完成，" + Chart.notes.Count + " 个音符。可以撤销、试听、保存或重新录制。"; }
            else { Screen = returnScreen; Status = "已结束试听 / 游玩。"; }
            UI.Rebuild();
        }
        public void Undo()
        {
            if (!Draft || Recorder == null || Screen == MusicScreen.Playing) return;
            if (Recorder.Undo())
            {
                staleVisuals.Clear(); foreach (var pair in visible) if (pair.Key >= Recorder.Notes.Count) staleVisuals.Add(pair.Key);
                foreach (int key in staleVisuals) RemoveVisual(key);
                nextVisual = Math.Min(nextVisual, Recorder.Notes.Count);
                Dirty = true; SyncDraft(); Feedback = "已撤销最后一次录入（双生成对撤销）"; feedbackLeft = 1; Status = Feedback; UI.Rebuild();
            }
        }
        public void Save()
        {
            if (Running || !Draft || Chart == null) return;
            SyncDraft(); Chart.title = UI.TitleText;
            try
            {
                MusicLevel level = Store.Save(Chart, audioPath); Chart = level.Chart; audioPath = level.AudioPath; Draft = Dirty = ConfirmDiscard = false;
                Screen = MusicScreen.Library; ReleaseClip(); ResetView(Phase.Menu); RefreshLibrary(); Status = "已保存「" + Chart.title + "」。音乐已复制到关卡库，重启后仍可游玩。";
            }
            catch (Exception e) { Status = "保存失败，录谱仍然保留：" + e.Message; }
        }
        public void BackToLibrary()
        {
            if (Running) { StopRun(); return; }
            if(Screen==MusicScreen.CharacterSelect){Screen=returnScreen;Status="已返回。";UI.Rebuild();return;}
            if (Dirty) { restartPending = false; ConfirmDiscard = true; Status = "有未保存的录谱，请保存或确认放弃。"; UI.Rebuild(); return; }
            Discard();
        }
        public void Discard()
        {
            clock.Stop(); Dirty = Draft = ConfirmDiscard = false; Recorder = null; Chart = null; Session = null;Battle=null;
            ReleaseClip(); ResetView(Phase.Menu); Screen = MusicScreen.Library; RefreshLibrary();
        }
        public void CancelDiscard() { ConfirmDiscard = restartPending = false; Status = "已保留当前录谱。"; UI.Rebuild(); }
        public void SetOffset(int delta)
        {
            if (Running) return; OffsetMs = Mathf.Clamp(OffsetMs + delta, -250, 250);
            if (!isSmoke) { PlayerPrefs.SetInt("dashing.music.offsetMs", OffsetMs); PlayerPrefs.Save(); }
            UI.Rebuild();
        }
        private void SyncDraft()
        {
            Chart.notes.Clear(); foreach (var note in Recorder.Notes) Chart.notes.Add(new RhythmNote(note.time, note.rail, note.kind, note.duration, note.pairId));
        }
        public void ToggleRecordTwins()
        {
            if (!Draft || (Running && Screen != MusicScreen.Recording)) return;
            RecordTwins = !RecordTwins; UI.Rebuild();
        }
        private void ResetView(Phase phase)
        {
            var layout = Host.Game.S.Layout;
            View = Screen==MusicScreen.Playing&&Battle!=null?Battle.State:new Game(12345,1,SelectedCharacter,layout).S;
            View.Phase=phase;
            visible.Clear(); nextVisual = 0; Host.ResetMusicStage(View);
        }
        public void Resize(Layout layout) { if (View != null) {View.Layout = layout;if(Screen==MusicScreen.Recording)UpdateRecordingNotes(clock.Time);} }
        public void Tick(float dt)
        {
            ReadControls();
            if (Running && !Paused)
            {
                double raw = clock.Time, judgeTime = raw - OffsetMs / 1000.0;
                feedbackLeft -= dt; if (feedbackLeft <= 0) Feedback = "";
                if (Screen == MusicScreen.Playing)
                {
                    Battle.Advance(judgeTime);
                    foreach (var result in Session.Expired) { RemoveVisual(result.index); Feedback = "漏怪 · 连击清零"; feedbackLeft = .6f; }
                    UpdateNotes(raw);
                    FlushCombatCues();
                    if (Battle.Finished(judgeTime)) { clock.Stop(); Status=View.Hp<=0?"生命耗尽，关卡结束。":"音乐结束，关卡完成。"; View.Phase = Phase.Over; Screen = MusicScreen.Results; UI.Rebuild(); }
                }
                else {View.Now=Math.Max(0,raw);UpdateRecordingNotes(raw);if(raw>=Chart.duration)StopRun();}
            }
        }
        private void UpdateNotes(double now)
        {
            var notes = Session.Chart.notes; var layout = View.Layout;
            while (nextVisual < notes.Count && notes[nextVisual].time - now <= RhythmSession.Approach)
            {
                int i = nextVisual++; if (Session.Judgments[i] != RhythmJudgment.Pending) continue;
                var monster = Battle.MonsterAt(i);visible.Add(i, monster);
            }
            foreach (var pair in visible)
            {
                if (pair.Value.Removed) continue;
                var note = notes[pair.Key]; pair.Value.X = layout.HitX + (note.time - now) / RhythmSession.Approach * (layout.Width + 60 - layout.HitX);
                pair.Value.Y = layout.Y(note.rail); pair.Value.Phase = now * 5;
                if (note.kind == MonsterKind.Hold)
                {
                    var monster = pair.Value; monster.H = 38; monster.Len = monster.W = MathEx.Clamp(note.duration * (layout.Width + 60 - layout.HitX) / RhythmSession.Approach, 80, layout.Width * 4);
                    monster.X -= monster.H * .46;
                    if (monster.Anchored) monster.X = layout.HitX - monster.H * .46;
                }
            }
            staleVisuals.Clear(); foreach (var pair in visible) if (pair.Value.Removed) staleVisuals.Add(pair.Key);
            foreach (int index in staleVisuals) visible.Remove(index);
            View.Monsters.RemoveAll(m => m.Removed);
        }
        private void RemoveVisual(int index) { Monster m; if (visible.TryGetValue(index, out m)) { m.Removed = true; visible.Remove(index); } }
        private void UpdateRecordingNotes(double raw)
        {
            double corrected=raw-OffsetMs/1000.0;
            staleVisuals.Clear();
            nextVisual = Math.Min(nextVisual, Recorder.Notes.Count);
            while (nextVisual < Recorder.Notes.Count)
            {
                int i = nextVisual++; var note = Recorder.Notes[i];
                var monster = new Monster { Id=i+1,Kind=note.kind,Lane=note.rail,W=42,H=42,Sf=1,PairId=note.pairId };
                if (note.kind == MonsterKind.Twin) monster.PartnerId = note.rail == Lane.Top ? i+2 : i;
                visible.Add(i,monster); View.Monsters.Add(monster);
            }
            foreach (var pair in visible)
            {
                if (pair.Key >= Recorder.Notes.Count) { staleVisuals.Add(pair.Key); continue; }
                var note = Recorder.Notes[pair.Key]; var monster = pair.Value;
                double age=corrected-note.time, length=Recorder.PreviewDuration(note,Math.Min(corrected,Chart.duration));
                if (age-length>3) { staleVisuals.Add(pair.Key); continue; }
                monster.Kind=length>=ChartRecorder.HoldThreshold?MonsterKind.Hold:note.kind;
                if(monster.Kind==MonsterKind.Hold)
                {monster.H=38;monster.HoldDuration=Math.Max(ChartRecorder.HoldThreshold,length);monster.Len=monster.W=MathEx.Clamp(length*(View.Layout.Width/2+60)/3,80,View.Layout.Width*4);}
                monster.X=View.Layout.Width/2-Math.Max(0,age)*(View.Layout.Width/2+60)/3;
                if(monster.Kind==MonsterKind.Hold)monster.X-=monster.H*.46;
                monster.Y=View.Layout.Y(note.rail);monster.Phase=raw*5;
            }
            foreach(int key in staleVisuals)RemoveVisual(key);
            View.Monsters.RemoveAll(m=>m.Removed);
        }
        private void FlushCombatCues()
        {foreach(var cue in Battle.Combat.Cues)Host.MusicCue(cue,View);Battle.Combat.Cues.Clear();}
        public void Tap(Lane rail)
        { string input = "tap:" + rail; Press(rail, input); Release(input); }
        public void Press(Lane rail, string input)
        {
            if (!Running || Paused || string.IsNullOrEmpty(input) || activeInputs.ContainsKey(input)) return;
            double raw = clock.Time; if (raw < 0 || raw >= Chart.duration + RhythmSession.GoodWindow) return;
            activeInputs.Add(input, rail);
            UI.PulseRail(rail);
            double corrected = raw - OffsetMs / 1000.0;
            if (Screen == MusicScreen.Recording)
            {
                if (!Recorder.Press(corrected, rail, Chart.duration, input, RecordTwins)) return;
                Dirty = true; Feedback = (rail == Lane.Top ? "上轨" : "下轨") + "  " + corrected.ToString("F3") + "s  ·  已录 " + Recorder.Notes.Count; feedbackLeft = .75f;
                UpdateRecordingNotes(raw);
                Host.MusicCue(new Cue(CueKind.Hit, View.Layout.Width/2, View.Layout.Y(rail), rail, true), View);
            }
            else
            {
                Battle.Advance(corrected); foreach (var expired in Session.Expired) RemoveVisual(expired.index);
                var result = Battle.Press(rail, corrected, input);FlushCombatCues();
                if (result.index < 0) { Feedback = "空击"; feedbackLeft = .3f; return; }
                if (result.judgment == RhythmJudgment.Pending)
                    Feedback = Session.Chart.notes[result.index].kind == MonsterKind.Hold ? "长按中 · 保持 " + Session.Chart.notes[result.index].duration.ToString("F2") + " 秒" : "双生 · 180 毫秒内击打另一轨";
                else
                {
                    Feedback = (result.judgment==RhythmJudgment.Perfect?"暴击":"普攻") + "  " + (result.error < 0 ? "Early " : "Late +") + (result.error * 1000).ToString("F0") + " ms";
                    UpdateNotes(raw);
                }
                feedbackLeft = .7f;
            }
        }
        public void Release(string input)
        {
            if (!activeInputs.Remove(input) || !Running) return;
            if (Screen == MusicScreen.Recording)
            {
                if (Recorder.Release(input, clock.Time - OffsetMs / 1000.0, Chart.duration))
                { Dirty = true; Feedback = Recorder.Warning ?? (Recorder.LastReleased.kind == MonsterKind.Hold ? "长按已记录 · " + Recorder.LastReleased.duration.ToString("F3") + " 秒" : "单击已记录"); feedbackLeft = .7f; UpdateRecordingNotes(clock.Time); }
            }
            else if (Paused) pausedReleases.Add(input);
            else ReleasePlaying(input);
        }
        private void ReleasePlaying(string input)
        {
            double corrected = clock.Time - OffsetMs / 1000.0;
            Battle.Advance(corrected); var result = Battle.Release(input, corrected); FlushCombatCues();
            if (result.index >= 0 && result.judgment == RhythmJudgment.Miss) { Feedback = "长按时长不足 · 连击清零"; feedbackLeft = .7f; }
            UpdateNotes(clock.Time);
        }
        private void ReadControls()
        {
            for (int rail = 0; rail < 2; rail++) for (int key = 0; key < Host.Keys.Count((Lane)rail); key++)
            { var binding = Host.Keys.Get((Lane)rail,key); if (Input.GetKeyUp(binding)) Release("key:" + binding); }
            if (ConfirmDiscard) { if (Input.GetKeyDown(KeyCode.Escape)) CancelDiscard(); return; }
            if (UI.Typing) return;
            if(Screen==MusicScreen.CharacterSelect&&(Input.GetKeyDown(KeyCode.Return)||Input.GetKeyDown(KeyCode.Space))){BeginPlay();return;}
            if (Input.GetKeyDown(KeyCode.F11)) Host.ToggleFullscreen();
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.P)) { if (Running) TogglePause(); else if (Screen == MusicScreen.Library) Close(); else if (Screen != MusicScreen.Loading) BackToLibrary(); return; }
            if (!Running || Paused) return;
            for (int rail = 0; rail < 2; rail++) for (int key = 0; key < Host.Keys.Count((Lane)rail); key++)
            { var binding = Host.Keys.Get((Lane)rail,key); if (Input.GetKeyDown(binding)) Press((Lane)rail,"key:" + binding); }
        }
        private void OnApplicationFocus(bool focused)
        {
            if (focused || !Active || !Running) return;
            if (!Paused) TogglePause();
            foreach (string input in new List<string>(activeInputs.Keys)) Release(input);
        }
        private void OnApplicationPause(bool paused) { if (paused) OnApplicationFocus(false); }
        private void ReleaseClip() { clock.Stop(); if (clip != null) { Destroy(clip); clip = null; } }
        [Serializable]
        private sealed class InputState
        {
            public bool active, paused, dirty, confirm, typing, characterVisible,fever,burning;
            public string screen, status, root,character;
            public double time,recordX,firstMonsterX;
            public int notes, levels, perfect, good, miss, score,hp,maxHp,monsters;
            public int holds, twins, holdId;
            public double lastHoldDuration, holdProgress;
            public bool recordTwins;
        }
        private void Update()
        {
            if (!inputCheck || UI == null || (probeTimer -= Time.unscaledDeltaTime) > 0) return;
            probeTimer = .05f;
            var state = new InputState { active = Active, screen = Screen.ToString(), paused = Paused, dirty = Dirty, confirm = ConfirmDiscard, typing = UI.Typing,
                status = Status, root = Store.Root, time = SongTime, notes = Recorder == null ? 0 : Recorder.Notes.Count, levels = Levels.Count,
                perfect = Session == null ? 0 : Session.Perfect, good = Session == null ? 0 : Session.Good, miss = Session == null ? 0 : Session.Miss, score = View.Score,
                characterVisible=Host.MusicCharacterVisible,character=View.Character.ToString(),hp=View.Hp,maxHp=View.MaxHp,fever=View.Fever,burning=View.Burning,monsters=View.Monsters.Count,
                recordX=View.Layout.Width/2,firstMonsterX=View.Monsters.Count>0?View.Monsters[0].X:-1 };
            var probeNotes = Draft && Recorder != null ? Recorder.Notes : Chart == null ? null : Chart.notes;
            if (probeNotes != null) foreach (var note in probeNotes)
            { if (note.kind == MonsterKind.Hold) { state.holds++; state.lastHoldDuration = note.duration; } if (note.kind == MonsterKind.Twin) state.twins++; }
            state.recordTwins = RecordTwins; state.holdId = View.HoldId;
            if (Battle != null && View.HoldId != 0) { var held = Battle.Combat.Find(View.HoldId); if (held != null) state.holdProgress = held.HoldT; }
            string output = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../TestResults/Music"));
            Directory.CreateDirectory(output); File.WriteAllText(Path.Combine(output, "input-state.json"), JsonUtility.ToJson(state));
        }
        private void OnDestroy() { if (clip != null) Destroy(clip); }
    }
}
