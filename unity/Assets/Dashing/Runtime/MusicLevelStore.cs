using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using Dashing.Core;

namespace Dashing.Unity
{
    public sealed class MusicLevel
    {
        public MusicChart Chart;
        public string Directory;
        public string AudioPath { get { return Path.Combine(Directory, "music.mp3"); } }
    }

    public sealed class MusicLevelStore
    {
        public const long MaxAudioBytes = 150L * 1024 * 1024;
        public readonly string Root;
        public MusicLevelStore(string root) { Root = Path.GetFullPath(root); }
        public List<MusicLevel> Load(out int skipped)
        {
            skipped = 0; var levels = new List<MusicLevel>();
            if (!Directory.Exists(Root)) return levels;
            foreach (string directory in Directory.GetDirectories(Root))
            {
                if (Path.GetFileName(directory).StartsWith(".", StringComparison.Ordinal)) continue;
                try
                {
                    string path = Path.Combine(directory, "chart.json");
                    if (!File.Exists(path) || new FileInfo(path).Length > 8 * 1024 * 1024) throw new IOException("谱面文件不存在或过大。");
                    var chart = JsonUtility.FromJson<MusicChart>(File.ReadAllText(path));
                    if (chart == null) throw new IOException("谱面无法读取。");
                    chart.Validate(); Guid id;
                    if (!Guid.TryParseExact(chart.id, "N", out id) || Path.GetFileName(directory) != chart.id) throw new IOException("关卡编号无效。");
                    CheckAudio(Path.Combine(directory, chart.audioFile));
                    levels.Add(new MusicLevel { Chart = chart, Directory = directory });
                }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException) { skipped++; }
            }
            levels.Sort((a, b) => string.CompareOrdinal(b.Chart.createdUtc, a.Chart.createdUtc));
            return levels;
        }
        public MusicLevel Save(MusicChart draft, string sourceAudio)
        {
            var chart = draft.Copy(); chart.title = (chart.title ?? "").Trim(); chart.Validate(); CheckAudio(sourceAudio);
            chart.id = Guid.NewGuid().ToString("N"); chart.createdUtc = DateTime.UtcNow.ToString("O");
            Directory.CreateDirectory(Root);
            string staging = Path.Combine(Root, ".saving-" + chart.id), final = Path.Combine(Root, chart.id);
            try
            {
                Directory.CreateDirectory(staging);
                File.Copy(sourceAudio, Path.Combine(staging, "music.mp3"), false);
                File.WriteAllText(Path.Combine(staging, "chart.json"), JsonUtility.ToJson(chart, true));
                Directory.Move(staging, final);
                return new MusicLevel { Chart = chart, Directory = final };
            }
            catch
            {
                if (Directory.Exists(staging)) { try { Directory.Delete(staging, true); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
                throw;
            }
        }
        public static void CheckAudio(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !string.Equals(Path.GetExtension(path), ".mp3", StringComparison.OrdinalIgnoreCase)) throw new IOException("请选择 MP3 文件。");
            var file = new FileInfo(path);
            if (!file.Exists) throw new FileNotFoundException("找不到音乐文件，请重新选择。", path);
            if (file.Length == 0 || file.Length > MaxAudioBytes) throw new IOException("MP3 文件必须非空且不超过 150 MB。");
        }
    }
}
