using System;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using Dashing.Core;

namespace Dashing.Unity
{
    public sealed class MusicModeUI
    {
        private readonly MusicMode music;
        private readonly GameObject root, panel, library, editor, transport, confirm,selection;
        private readonly Font font;
        private readonly Text status, header, time, feedback, score, offset, title, summary, page;
        private readonly InputField pathInput, titleInput;
        private readonly Button[] levelButtons = new Button[5];
        private readonly Button record, replay, save, undo, restart, finish, pause;
        private readonly Button rin,zhe;
        private readonly Button twinEditor, twinRecording;
        private readonly Text selectedCharacter,topHint,bottomHint;
        private readonly RectTransform[] railTargets = new RectTransform[2];
        private readonly CanvasGroup[] railHints = new CanvasGroup[2];
        private readonly Image[] railAccents = new Image[2];
        private readonly float[] railPulse = new float[2];
        private readonly GameObject recordLabels;
        public bool Typing { get { return pathInput.isFocused || titleInput.isFocused; } }
        public string PathText { get { return pathInput.text; } set { pathInput.text = value; } }
        public string TitleText { get { return titleInput.text; } set { titleInput.text = value; } }
        public MusicModeUI(MusicMode music)
        {
            this.music = music; font = Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei", "SimHei", "Arial" }, 20);
            if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            root = new GameObject("Music mode UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster)); root.transform.SetParent(music.transform, false);
            root.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay; root.GetComponent<Canvas>().sortingOrder = 200;
            var scaler = root.GetComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(1280, 720); scaler.matchWidthOrHeight = .5f;
            panel = Box("Music workspace", root.transform, new Color(.025f, .045f, .085f, .96f)); Stretch(panel.GetComponent<RectTransform>());
            title = Label("音乐模式 · 自制关卡", panel.transform, 30, Art.Sky, new Vector2(0, 302), new Vector2(940, 46));
            header = Label("", panel.transform, 16, Color.white, new Vector2(0, 259), new Vector2(1000, 36));
            status = Label("", root.transform, 16, Art.Gold, new Vector2(0, -286), new Vector2(1000, 68));
            library = Container("Level library", panel.transform);
            pathInput = Field("MP3 完整路径（也可以点击选择文件）", library.transform, new Vector2(-80, 193), new Vector2(740, 42), 1024);
            Button("选择 MP3", library.transform, music.PickFile, new Vector2(390, 193), new Vector2(160, 42));
            Button("导入并编谱", library.transform, () => music.Import(PathText), new Vector2(0, 137), new Vector2(260, 44));
            for (int i = 0; i < 5; i++)
            {
                int slot = i; levelButtons[i] = Button("", library.transform, () => music.PlayLevel(music.Page * 5 + slot), new Vector2(0, 66 - i * 55), new Vector2(920, 46));
            }
            Button("上一页", library.transform, () => music.ChangePage(-1), new Vector2(-180, -217), new Vector2(130, 36));
            page = Label("", library.transform, 15, Color.white, new Vector2(0, -217), new Vector2(180, 36));
            Button("下一页", library.transform, () => music.ChangePage(1), new Vector2(180, -217), new Vector2(130, 36));
            Button("返回主菜单", library.transform, music.Close, new Vector2(0, -329), new Vector2(230, 38));
            editor = Container("Chart review", panel.transform);
            titleInput = Field("关卡名称", editor.transform, new Vector2(0, 187), new Vector2(700, 46), 60);
            summary = Label("", editor.transform, 20, Color.white, new Vector2(0, 110), new Vector2(940, 85));
            record = Button("开始录谱", editor.transform, music.StartRecording, new Vector2(-205, 15), new Vector2(350, 52));
            replay = Button("试听 / 游玩", editor.transform, music.StartPlay, new Vector2(205, 15), new Vector2(350, 52));
            undo = Button("撤销最后一拍", editor.transform, music.Undo, new Vector2(-205, -55), new Vector2(350, 46));
            restart = Button("重新录制", editor.transform, music.RestartRecording, new Vector2(205, -55), new Vector2(350, 46));
            save = Button("保存为本地关卡", editor.transform, music.Save, new Vector2(0, -125), new Vector2(450, 52));
            twinEditor = Button("", editor.transform, music.ToggleRecordTwins, new Vector2(0, -169), new Vector2(560, 30));
            Button("返回关卡库", editor.transform, music.BackToLibrary, new Vector2(0, -329), new Vector2(230, 38));
            offset = Label("", editor.transform, 15, Art.Mint, new Vector2(0, -208), new Vector2(680, 48));
            Button("−10 ms", editor.transform, () => music.SetOffset(-10), new Vector2(-360, -208), new Vector2(120, 36));
            Button("+10 ms", editor.transform, () => music.SetOffset(10), new Vector2(360, -208), new Vector2(120, 36));
            selection=Container("Music character selection",panel.transform);
            Label("选择角色",selection.transform,30,Art.Gold,new Vector2(0,185),new Vector2(800,55));
            rin=Button("凛 · 镰刀",selection.transform,()=>music.SelectCharacter(Character.Rin),new Vector2(-205,95),new Vector2(350,70));
            zhe=Button("哲 · 棒球棍",selection.transform,()=>music.SelectCharacter(Character.Zhe),new Vector2(205,95),new Vector2(350,70));
            selectedCharacter=Label("",selection.transform,20,Color.white,new Vector2(0,-10),new Vector2(950,120));
            Label("暴击 300 / 普攻 200 · 每 50 连击 FEVER ×1.5\n同轨漏怪 −20 HP；异轨擦过不扣血，连击与 FEVER 清零",selection.transform,17,Art.Mint,new Vector2(0,-120),new Vector2(1000,90));
            Button("开始游玩",selection.transform,music.BeginPlay,new Vector2(0,-215),new Vector2(400,52));
            Button("返回",selection.transform,music.BackToLibrary,new Vector2(0,-329),new Vector2(230,38));
            transport = Container("Music transport", root.transform);
            time = Label("", transport.transform, 19, Color.white, new Vector2(0, 305), new Vector2(1040, 48));
            score = Label("", transport.transform, 17, Art.Mint, new Vector2(0, 256), new Vector2(1050, 42));
            feedback = Label("", transport.transform, 27, Art.Gold, new Vector2(120, 0), new Vector2(800, 65));
            pause = Button("暂停", transport.transform, music.TogglePause, new Vector2(-120, -318), new Vector2(200, 42));
            finish = Button("结束录制", transport.transform, music.StopRun, new Vector2(120, -318), new Vector2(200, 42));
            topHint = RailControl(Lane.Top);
            bottomHint = RailControl(Lane.Bottom);
            recordLabels=Container("Recording point labels",transport.transform);
            Label("← 上轨记录点",recordLabels.transform,16,Art.Sky,new Vector2(0,207),new Vector2(220,32));
            Label("← 下轨记录点",recordLabels.transform,16,Art.Mint,new Vector2(0,-110),new Vector2(220,32));
            twinRecording = Button("", transport.transform, music.ToggleRecordTwins, new Vector2(0, -238), new Vector2(450, 34));
            confirm = Box("Discard modal blocker", root.transform, new Color(0, 0, 0, .7f)); Stretch(confirm.GetComponent<RectTransform>());
            var dialog = Box("Discard confirmation", confirm.transform, new Color(.07f, .09f, .15f, .99f)); Place(dialog.GetComponent<RectTransform>(), Vector2.zero, new Vector2(790, 240));
            Label("当前录谱尚未保存", confirm.transform, 25, Art.Gold, new Vector2(0, 65), new Vector2(740, 55));
            Button("保留，继续编辑", confirm.transform, music.CancelDiscard, new Vector2(-190, -40), new Vector2(320, 50));
            Button("确认放弃 / 重录", confirm.transform, music.AcceptDiscard, new Vector2(190, -40), new Vector2(320, 50));
        }
        public void Show(bool visible) { root.SetActive(visible); }
        public void Rebuild()
        {
            bool lib = music.Screen == MusicScreen.Library; bool running = music.Running;
            bool choosing=music.Screen==MusicScreen.CharacterSelect;
            panel.SetActive(!running); library.SetActive(lib); editor.SetActive(!lib && !running && music.Screen != MusicScreen.Loading&&!choosing); transport.SetActive(running);selection.SetActive(choosing);
            recordLabels.SetActive(music.Screen==MusicScreen.Recording);
            bool recording = music.Screen == MusicScreen.Recording;
            string recordHint = music.RecordTwins ? "双生录入" : "点击或按住";
            topHint.text = recording ? "上轨  /  " + recordHint : "上轨  /  点击出刀";
            bottomHint.text = recording ? "下轨  /  " + recordHint : "下轨  /  点击出刀";
            twinEditor.gameObject.SetActive(music.Draft);
            twinRecording.gameObject.SetActive(recording);
            string twinText = music.RecordTwins ? "双生：开 · 点任一轨录入一对（点此关闭）" : "双生：关 · 点此开启，一次录入一对";
            twinEditor.GetComponentInChildren<Text>().text = twinText;
            twinRecording.GetComponentInChildren<Text>().text = twinText;
            twinRecording.interactable = !music.Paused;
            for (int i = 0; i < railPulse.Length; i++) railPulse[i] = 0;
            UpdateRailControls();
            bool useRin=music.SelectedCharacter==Character.Rin;
            rin.GetComponentInChildren<Text>().text=(useRin?"✓ ":"")+"凛 · 镰刀";
            zhe.GetComponentInChildren<Text>().text=(!useRin?"✓ ":"")+"哲 · 棒球棍";
            selectedCharacter.text=useRin?"凛 · 初始 125 / 250 HP\n命中回血 +5；满血燃魂，得分 ×2\n燃魂期间持续消耗生命，最低回落至 125 HP":"哲 · 初始 300 / 300 HP\n生命更高，适合熟悉自己的谱面\n沿用生存模式的棒球棍动作与判定反馈";
            confirm.SetActive(music.ConfirmDiscard); status.text = music.Status;
            header.text = music.Screen == MusicScreen.Loading ? "正在读取本地音乐…" : choosing?music.Chart.title:lib ? "选择关卡，或导入自己的 MP3 来编谱" : music.Screen == MusicScreen.Results ? "演奏完成" : "短按录单击；按住至少 0.2 秒录长按；开启双生录入后点一次生成一对";
            for (int i = 0; i < levelButtons.Length; i++)
            {
                int index = music.Page * 5 + i; levelButtons[i].gameObject.SetActive(index < music.Levels.Count);
                if (index < music.Levels.Count) { var chart = music.Levels[index].Chart; levelButtons[i].GetComponentInChildren<Text>().text = chart.title + "    ·    " + chart.duration.ToString("F0") + " 秒    ·    " + chart.notes.Count + " 音符    ▶ 游玩"; }
            }
            page.text = (music.Page + 1) + " / " + Math.Max(1, (music.Levels.Count + 4) / 5);
            bool hasNotes = music.Chart != null && music.Chart.notes.Count > 0;
            record.gameObject.SetActive(music.Draft); record.interactable = music.Draft && !hasNotes;
            replay.interactable = hasNotes; undo.gameObject.SetActive(music.Draft); undo.interactable = hasNotes; restart.gameObject.SetActive(music.Draft);
            save.gameObject.SetActive(music.Draft); save.interactable = hasNotes; titleInput.interactable = music.Draft;
            offset.text = "输入补偿 " + (music.OffsetMs >= 0 ? "+" : "") + music.OffsetMs + " ms\n正值会将按键记录 / 判定时间提前";
            pause.GetComponentInChildren<Text>().text = music.Paused ? "继续" : "暂停";
            finish.GetComponentInChildren<Text>().text = music.Screen == MusicScreen.Recording ? "结束录制" : "结束游玩";
            if (music.Chart != null)
            {
                int top = 0, holds = 0, twins = 0; foreach (var note in music.Chart.notes) { if (note.rail == Lane.Top) top++; if (note.kind == MonsterKind.Hold) holds++; if (note.kind == MonsterKind.Twin) twins++; }
                summary.text = music.Chart.duration.ToString("F1") + " 秒    ·    " + music.Chart.notes.Count + " 音符（上 " + top + " / 下 " + (music.Chart.notes.Count - top) + "）\n长按 " + holds + " 个 · 双生 " + twins/2 + " 对\n" + music.Host.KeyDescription;
                if (music.Screen == MusicScreen.Results && music.Session != null) summary.text = Results();
            }
        }
        private string Results()
        {
            var s = music.Session;var v=music.View;return "得分 " + v.Score + "    准确率 " + (s.Accuracy * 100).ToString("F2") + "%    最大连击 " + v.MaxCombo +
                "\n暴击 " + s.Perfect + "    普攻 " + s.Good + "    漏怪 " + s.Miss+"    HP "+v.Hp+" / "+v.MaxHp+(v.Fever?"    FEVER ×1.5":"")+(v.Burning?"    燃魂 ×2":"");
        }
        public void Tick()
        {
            status.text = music.Status; confirm.SetActive(music.ConfirmDiscard);
            if (!music.Running) return;
            UpdateRailControls();
            double t = music.SongTime;
            time.text = (music.Screen == MusicScreen.Recording ? "● 录谱" : "▶ 演奏") + "  ·  " + music.Chart.title + "  ·  " + Math.Max(0, t).ToString("F2") + " / " + music.Duration.ToString("F1") + " 秒";
            score.text = music.Screen == MusicScreen.Recording ? "已录 " + music.Recorder.Notes.Count + " 个音符    ·    " + music.Host.KeyDescription + "\n短按单击 · 按住 ≥0.2 秒录长按（记录实际时长） · 双生开关可一键录入一对" : Results();
            feedback.text = music.Paused ? "已暂停 · 点击继续" : t < 0 ? "准备  " + Math.Ceiling(-t).ToString("F0") : music.Feedback;
            if (!music.Paused && music.Screen == MusicScreen.Recording)
                foreach (var note in music.Recorder.HeldNotes)
                {
                    double length = music.Recorder.PreviewDuration(note, t - music.OffsetMs / 1000.0);
                    if (length >= ChartRecorder.HoldThreshold) feedback.text = "录制长按 · " + (note.rail == Lane.Top ? "上轨 " : "下轨 ") + length.ToString("F2") + " 秒 · 松开完成";
                }
            if (!music.Paused && music.Screen == MusicScreen.Playing && music.View.HoldId != 0)
            {
                var held = music.Battle.Combat.Find(music.View.HoldId);
                if (held != null) feedback.text = "长按中  " + held.HoldT.ToString("F2") + " / " + held.HoldDuration.ToString("F2") + " 秒 · 另一轨可出刀";
            }
            pause.GetComponentInChildren<Text>().text = music.Paused ? "继续" : "暂停";
        }
        private Text RailControl(Lane rail)
        {
            int i = (int)rail;
            Color color = Art.LaneColor(rail);
            // Invisible hit surface avoids Selectable tint and persistent battlefield rectangles.
            var target = Box("Music rail input " + rail, transport.transform, Color.clear);
            railTargets[i] = target.GetComponent<RectTransform>();
            Place(railTargets[i], Vector2.zero, new Vector2(1000, 130));
            target.AddComponent<MusicRailPointer>().Initialize(music, rail);
            var hint = new GameObject("Music rail hint " + rail, typeof(RectTransform), typeof(CanvasGroup));
            hint.transform.SetParent(target.transform, false);
            var rect = hint.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = new Vector2(1, .5f);
            rect.pivot = new Vector2(1, .5f); rect.anchoredPosition = new Vector2(-18, 42); rect.sizeDelta = new Vector2(180, 28);
            railHints[i] = hint.GetComponent<CanvasGroup>();
            railHints[i].blocksRaycasts = false; railHints[i].interactable = false;
            var label = Label("", hint.transform, 14, color, Vector2.zero, new Vector2(180, 24));
            label.alignment = TextAnchor.MiddleRight;
            var accent = Box("Rail input accent", hint.transform, color);
            railAccents[i] = accent.GetComponent<Image>(); railAccents[i].raycastTarget = false;
            var line = accent.GetComponent<RectTransform>();
            line.anchorMin = line.anchorMax = new Vector2(1, 0); line.pivot = new Vector2(1, .5f);
            line.anchoredPosition = new Vector2(0, -3); line.sizeDelta = new Vector2(28, 2);
            return label;
        }
        public void PulseRail(Lane rail) { railPulse[(int)rail] = 1; }
        private void UpdateRailControls()
        {
            var layout = music.View.Layout;
            var canvasRect = (RectTransform)transport.transform;
            for (int i = 0; i < railTargets.Length; i++)
            {
                Vector2 position;
                var point = new Vector2(Screen.width * .5f, Screen.height * (1 - (float)(layout.Y((Lane)i) / layout.Height)));
                RectTransformUtility.ScreenPointToLocalPointInRectangle(canvasRect, point, null, out position);
                railTargets[i].anchoredPosition = position;
                railTargets[i].sizeDelta = new Vector2(Mathf.Max(180, canvasRect.rect.width - 48), 130);
                if (!music.Paused) railPulse[i] = Mathf.Max(0, railPulse[i] - Time.unscaledDeltaTime * 4);
                float pulse = railPulse[i] * railPulse[i];
                railHints[i].alpha = music.Paused ? .25f : .45f + pulse * .55f;
                railAccents[i].rectTransform.sizeDelta = new Vector2(28 + pulse * 64, 2);
                railAccents[i].color = Color.Lerp(Art.LaneColor((Lane)i), Color.white, pulse * .7f);
            }
        }
        private GameObject Container(string name, Transform parent)
        { var go = new GameObject(name, typeof(RectTransform)); go.transform.SetParent(parent, false); Stretch(go.GetComponent<RectTransform>()); return go; }
        private GameObject Box(string name, Transform parent, Color color)
        { var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image)); go.transform.SetParent(parent, false); go.GetComponent<Image>().color = color; return go; }
        private Text Label(string text, Transform parent, int size, Color color, Vector2 position, Vector2 dimensions)
        { var go = new GameObject(text.Length < 50 ? text : "Music text", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text)); go.transform.SetParent(parent, false); var label = go.GetComponent<Text>(); label.font = font; label.text = text; label.fontSize = size; label.color = color; label.alignment = TextAnchor.MiddleCenter; label.raycastTarget = false; label.supportRichText = false; label.horizontalOverflow = HorizontalWrapMode.Wrap; Place(label.rectTransform, position, dimensions); return label; }
        private Button Button(string text, Transform parent, Action action, Vector2 position, Vector2 dimensions)
        { var box = Box(text, parent, new Color(.1f, .19f, .28f, .98f)); Place(box.GetComponent<RectTransform>(), position, dimensions); var button = box.AddComponent<Button>(); button.targetGraphic = box.GetComponent<Image>(); var label = Label(text, box.transform, 18, Color.white, Vector2.zero, dimensions); Stretch(label.rectTransform); button.onClick.AddListener(() => { if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null); action(); }); return button; }
        private InputField Field(string placeholder, Transform parent, Vector2 position, Vector2 dimensions, int maxLength)
        {
            var box = Box(placeholder, parent, new Color(.08f, .13f, .2f)); Place(box.GetComponent<RectTransform>(), position, dimensions);
            var field = box.AddComponent<InputField>(); var label = Label("", box.transform, 18, Color.white, Vector2.zero, dimensions - new Vector2(24, 0)); label.alignment = TextAnchor.MiddleLeft;
            var hint = Label(placeholder, box.transform, 16, new Color(.5f, .6f, .7f), Vector2.zero, dimensions - new Vector2(24, 0)); hint.alignment = TextAnchor.MiddleLeft;
            field.textComponent = label; field.placeholder = hint; field.characterLimit = maxLength; field.lineType = InputField.LineType.SingleLine; return field;
        }
        private static void Place(RectTransform rect, Vector2 position, Vector2 size) { rect.anchorMin = rect.anchorMax = new Vector2(.5f, .5f); rect.pivot = new Vector2(.5f, .5f); rect.anchoredPosition = position; rect.sizeDelta = size; }
        private static void Stretch(RectTransform rect) { rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one; rect.offsetMin = rect.offsetMax = Vector2.zero; }
    }

    public sealed class MusicRailPointer : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        private MusicMode music; private Lane rail;
        public void Initialize(MusicMode mode, Lane value) { music = mode; rail = value; }
        public void OnPointerDown(PointerEventData data) { if (data.button == PointerEventData.InputButton.Left) music.Press(rail,"pointer:" + data.pointerId); }
        public void OnPointerUp(PointerEventData data) { if (data.button == PointerEventData.InputButton.Left) music.Release("pointer:" + data.pointerId); }
    }
}
