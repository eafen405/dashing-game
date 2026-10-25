using System;
using System.Runtime.InteropServices;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    public sealed class MusicAudio
    {
        private readonly AudioSource source;
        private readonly SongTimeline timeline = new SongTimeline();
        public bool Paused { get { return timeline.Paused; } }
        public double Time { get { return timeline.Time(AudioSettings.dspTime); } }
        public MusicAudio(AudioSource source) { this.source = source; source.playOnAwake = false; source.volume = .8f; source.loop = false; }
        public void Start(AudioClip clip)
        {
            source.Stop(); source.clip = clip;
            double dsp = AudioSettings.dspTime; timeline.Start(dsp, RhythmSession.Approach);
            source.PlayScheduled(dsp + RhythmSession.Approach);
        }
        public void Pause()
        {
            if (Paused) return; timeline.Pause(AudioSettings.dspTime);
            if (Time < 0) source.Stop(); else source.Pause();
        }
        public void Resume()
        {
            if (!Paused) return; double position = Time, dsp = AudioSettings.dspTime; timeline.Resume(dsp);
            if (position < 0) source.PlayScheduled(dsp - position); else source.UnPause();
        }
        public void Stop() { source.Stop(); }
    }

    internal static class MusicFilePicker
    {
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct OpenFileName
        {
            public int size; public IntPtr owner, instance, filter, customFilter;
            public int maxCustomFilter, filterIndex; public IntPtr file; public int maxFile;
            public IntPtr fileTitle; public int maxFileTitle; public IntPtr initialDirectory, title;
            public int flags; public short fileOffset, extensionOffset; public IntPtr defaultExtension;
            public IntPtr customData, hook, templateName, reserved; public int reserved2, flagsEx;
        }
        [DllImport("comdlg32.dll", EntryPoint = "GetOpenFileNameW", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetOpenFileName(ref OpenFileName value);
        [DllImport("comdlg32.dll")] private static extern int CommDlgExtendedError();
        [DllImport("user32.dll")] private static extern IntPtr GetActiveWindow();
#endif
        public static string Pick()
        {
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            // Use unmanaged buffers so Mono can pass the Win32 struct without nested string builders.
            var value = new OpenFileName { size = Marshal.SizeOf(typeof(OpenFileName)), owner = GetActiveWindow(), maxFile = 4096,
                flags = 0x00080000 | 0x00001000 | 0x00000800 | 0x00000008 | 0x02000000 };
            try
            {
                value.file = Marshal.AllocHGlobal(value.maxFile * 2); Marshal.WriteInt16(value.file, 0);
                value.filter = Marshal.StringToHGlobalUni("MP3 音乐 (*.mp3)\0*.mp3\0\0");
                value.title = Marshal.StringToHGlobalUni("选择要编谱的 MP3 音乐"); value.defaultExtension = Marshal.StringToHGlobalUni("mp3");
                if (GetOpenFileName(ref value)) return Marshal.PtrToStringUni(value.file);
                int error = CommDlgExtendedError();
                if (error != 0) throw new InvalidOperationException("文件选择器无法打开，错误码 " + error + "。请在输入框粘贴 MP3 路径。");
            }
            finally
            {
                if (value.file != IntPtr.Zero) Marshal.FreeHGlobal(value.file);
                if (value.filter != IntPtr.Zero) Marshal.FreeHGlobal(value.filter);
                if (value.title != IntPtr.Zero) Marshal.FreeHGlobal(value.title);
                if (value.defaultExtension != IntPtr.Zero) Marshal.FreeHGlobal(value.defaultExtension);
            }
#endif
            return null;
        }
    }
}
