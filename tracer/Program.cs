using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Parsers;
using Microsoft.Diagnostics.Tracing.Session;
using System.Diagnostics;
using System.Management;
using System.Text.Json;

namespace HardWatch.Tracer;

internal class Program
{
    // 启动参数
    private static int s_intervalSec = 2;
    private static int s_diskNumber = 0;  // 默认物理盘0
    private static bool s_listOnly = false;  // 仅列出物理盘列表

    // 线程→进程映射
    private static readonly Dictionary<int, int> s_threadToPid = new();
    // 进程→名称映射
    private static readonly Dictionary<int, string> s_pidToName = new();

    // 进程 I/O 聚合：(pid, diskNumber) → (readBytes, writeBytes)
    private static readonly Dictionary<(int pid, int disk), (long read, long write)> s_stats = new();

    // 物理盘 I/O 聚合（按 diskNumber）→ (readBytes, writeBytes)
    private static readonly Dictionary<int, (long read, long write)> s_diskStats = new();

    // 锁
    private static readonly object s_lock = new();

    private static TraceEventSession? s_session;

    private static async Task<int> Main(string[] args)
    {
        // 解析参数
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--interval":
                    if (i + 1 < args.Length && int.TryParse(args[i + 1], out var iv))
                    {
                        s_intervalSec = Math.Clamp(iv, 1, 120);
                        i++;
                    }
                    break;
                case "--disk":
                    if (i + 1 < args.Length && int.TryParse(args[i + 1], out var dn))
                    {
                        s_diskNumber = dn;
                        i++;
                    }
                    break;
                case "--list-disks":
                    s_listOnly = true;
                    break;
                case "--help":
                case "-h":
                    Console.WriteLine("HardWatch.Tracer [--interval N] [--disk N] [--list-disks]");
                    Console.WriteLine("  --interval N  采集周期（秒，默认2）");
                    Console.WriteLine("  --disk N      监控的物理盘号（默认0）");
                    Console.WriteLine("  --list-disks  仅列出物理盘列表后退出");
                    return 0;
            }
        }

        // 仅列出物理盘
        if (s_listOnly)
        {
            return await ListDisksAsync();
        }

        // 启动时输出物理盘列表（前端首次启动需要）
        await OutputDisksAsync();

        // 预加载现有进程名映射
        PreloadProcesses();

        // 启动 ETW 会话
        try
        {
            StartEtwSession();
        }
        catch (Exception ex)
        {
            // 输出错误事件
            var errPayload = new
            {
                type = "error",
                message = "ETW 会话启动失败：" + ex.Message + "（请以管理员身份运行）"
            };
            Console.WriteLine(JsonSerializer.Serialize(errPayload));
            return 1;
        }

        // 周期输出
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        AppDomain.CurrentDomain.ProcessExit += (_, _) => StopEtwSession();

        try
        {
            await OutputLoopAsync(cts.Token);
        }
        finally
        {
            StopEtwSession();
        }

        return 0;
    }

    /// <summary>
    /// 通过 WMI 列出物理硬盘，输出 JSON 到 stdout
    /// </summary>
    private static async Task<int> ListDisksAsync()
    {
        await OutputDisksAsync();
        return 0;
    }

    /// <summary>
    /// 通过 WMI 查询物理硬盘列表，包含每个物理盘对应的所有盘符
    /// </summary>
    private static async Task OutputDisksAsync()
    {
        var disks = new List<object>();

        try
        {
            // 查询物理盘
            var diskMap = new Dictionary<int, (string model, long size)>();
            using (var searcher = new ManagementObjectSearcher(
                "SELECT Index,Model,Size FROM Win32_DiskDrive"))
            {
                foreach (var mo in searcher.Get().Cast<ManagementObject>())
                {
                    var idx = Convert.ToInt32(mo["Index"]);
                    var model = mo["Model"]?.ToString() ?? $"Disk {idx}";
                    var sizeBytes = mo["Size"] != null ? Convert.ToInt64(mo["Size"]) : 0;
                    diskMap[idx] = (model, sizeBytes);
                }
            }

            // 查询 物理盘号 → 盘符列表 映射
            // 链路：Win32_DiskDrive (Index) -> Win32_DiskDriveToDiskPartition -> Win32_DiskPartition (DiskIndex) -> Win32_LogicalDiskToPartition -> Win32_LogicalDisk (DeviceID)
            var diskToLetters = new Dictionary<int, List<string>>();
            using (var partitionSearcher = new ManagementObjectSearcher(
                "SELECT DiskIndex,DeviceID FROM Win32_DiskPartition"))
            {
                var partitionToDisk = new Dictionary<string, int>();
                foreach (var mo in partitionSearcher.Get().Cast<ManagementObject>())
                {
                    var diskIdx = Convert.ToInt32(mo["DiskIndex"]);
                    var partId = mo["DeviceID"]?.ToString() ?? "";
                    if (!string.IsNullOrEmpty(partId))
                        partitionToDisk[partId] = diskIdx;
                }

                using var ldSearcher = new ManagementObjectSearcher(
                    "ASSOCIATORS OF {Win32_LogicalDisk} WHERE ResultClass=Win32_DiskPartition");
                // 改用 Win32_LogicalDiskToPartition 关联类
                using var assocSearcher = new ManagementObjectSearcher(
                    "SELECT Antecedent,Dependent FROM Win32_LogicalDiskToPartition");
                foreach (var mo in assocSearcher.Get().Cast<ManagementObject>())
                {
                    // Antecedent 是 Win32_DiskPartition，Dependent 是 Win32_LogicalDisk
                    var ant = mo["Antecedent"]?.ToString() ?? "";
                    var dep = mo["Dependent"]?.ToString() ?? "";
                    // 解析 DeviceID="磁盘 #0, #0" 和 DeviceID="C:"
                    var partMatch = System.Text.RegularExpressions.Regex.Match(ant, @"DeviceID=""([^""]+)""");
                    var letterMatch = System.Text.RegularExpressions.Regex.Match(dep, @"DeviceID=""([^""]+)""");
                    if (partMatch.Success && letterMatch.Success)
                    {
                        var partId = partMatch.Groups[1].Value;
                        var letter = letterMatch.Groups[1].Value;
                        if (partitionToDisk.TryGetValue(partId, out var diskIdx))
                        {
                            if (!diskToLetters.TryGetValue(diskIdx, out var list))
                            {
                                list = new List<string>();
                                diskToLetters[diskIdx] = list;
                            }
                            if (!list.Contains(letter)) list.Add(letter);
                        }
                    }
                }
            }

            // 组装输出
            foreach (var kv in diskMap.OrderBy(x => x.Key))
            {
                var letters = diskToLetters.TryGetValue(kv.Key, out var l) ? l : new List<string>();
                disks.Add(new
                {
                    number = kv.Key,
                    name = kv.Value.model,
                    sizeBytes = kv.Value.size,
                    letters = letters.OrderBy(x => x).ToList()
                });
            }
        }
        catch (Exception ex)
        {
            disks.Add(new { number = -1, name = "查询失败：" + ex.Message, sizeBytes = 0L, letters = new List<string>() });
        }

        var payload = new
        {
            type = "disks",
            disks = disks.OrderBy(d => ((dynamic)d).number).ToList()
        };
        Console.WriteLine(JsonSerializer.Serialize(payload));
    }

    /// <summary>
    /// 预加载当前所有进程的 PID→Name 和 ThreadID→PID 映射
    /// 关键：ETW ThreadStart 只能捕获新线程，已存在的线程必须通过 Process.Threads 预加载
    /// 否则启动后已运行进程的磁盘 I/O 无法关联到 PID
    /// </summary>
    private static void PreloadProcesses()
    {
        lock (s_lock)
        {
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    s_pidToName[p.Id] = p.ProcessName + ".exe";
                    // 关键：遍历进程的所有线程，建立 ThreadID → PID 映射
                    foreach (System.Diagnostics.ProcessThread t in p.Threads)
                    {
                        s_threadToPid[t.Id] = p.Id;
                    }
                }
                catch
                {
                    // 跳过无法访问的进程（如 SYSTEM 进程）
                }
            }
            Console.Error.WriteLine($"[Tracer] Preloaded {s_pidToName.Count} processes, {s_threadToPid.Count} thread mappings");
        }
    }

    /// <summary>
    /// 启动 ETW 内核会话，订阅 DiskIO + Thread 事件
    /// </summary>
    private static void StartEtwSession()
    {
        // NT Kernel Logger 必须用固定名称 "NT Kernel Logger"
        s_session = new TraceEventSession("NT Kernel Logger");

        var keywords = KernelTraceEventParser.Keywords.DiskIO
                     | KernelTraceEventParser.Keywords.Thread
                     | KernelTraceEventParser.Keywords.Process;

        s_session.EnableKernelProvider(keywords);

        // 注册事件处理
        var source = s_session.Source;

        // 线程启动：建立 ThreadID → ProcessID 映射
        source.Kernel.ThreadStart += data =>
        {
            lock (s_lock)
            {
                s_threadToPid[(int)data.ThreadID] = (int)data.ProcessID;
                if (!s_pidToName.ContainsKey((int)data.ProcessID))
                {
                    s_pidToName[(int)data.ProcessID] = string.IsNullOrEmpty(data.ProcessName)
                        ? $"pid_{data.ProcessID}"
                        : data.ProcessName + ".exe";
                }
            }
        };

        source.Kernel.ThreadStop += data =>
        {
            lock (s_lock)
            {
                s_threadToPid.Remove((int)data.ThreadID);
            }
        };

        // 进程启动：记录名称
        source.Kernel.ProcessStart += data =>
        {
            lock (s_lock)
            {
                // ProcessName 不含 .exe 后缀
                var name = !string.IsNullOrEmpty(data.ProcessName)
                    ? data.ProcessName + ".exe"
                    : $"pid_{data.ProcessID}";
                s_pidToName[(int)data.ProcessID] = name;
            }
        };

        source.Kernel.ProcessStop += data =>
        {
            lock (s_lock)
            {
                // 进程结束时输出其最终统计
                s_pidToName.Remove((int)data.ProcessID);
            }
        };

        // 磁盘读
        source.Kernel.DiskIORead += data =>
        {
            lock (s_lock)
            {
                var diskNum = (int)data.DiskNumber;
                // 物理盘聚合
                if (!s_diskStats.TryGetValue(diskNum, out var ds))
                    ds = (0, 0);
                s_diskStats[diskNum] = (ds.read + data.TransferSize, ds.write);

                // 进程聚合：diskNumber=-1 表示全部，按 pid 汇总；否则按 (pid, diskNum)
                if ((s_diskNumber < 0 || diskNum == s_diskNumber) &&
                    s_threadToPid.TryGetValue((int)data.ThreadID, out var pid))
                {
                    var key = s_diskNumber < 0 ? (pid, -1) : (pid, diskNum);
                    if (!s_stats.TryGetValue(key, out var st))
                        st = (0, 0);
                    s_stats[key] = (st.read + data.TransferSize, st.write);
                }
            }
        };

        // 磁盘写
        source.Kernel.DiskIOWrite += data =>
        {
            lock (s_lock)
            {
                var diskNum = (int)data.DiskNumber;
                // 物理盘聚合
                if (!s_diskStats.TryGetValue(diskNum, out var ds))
                    ds = (0, 0);
                s_diskStats[diskNum] = (ds.read, ds.write + data.TransferSize);

                // 进程聚合：diskNumber=-1 表示全部，按 pid 汇总；否则按 (pid, diskNum)
                if ((s_diskNumber < 0 || diskNum == s_diskNumber) &&
                    s_threadToPid.TryGetValue((int)data.ThreadID, out var pid))
                {
                    var key = s_diskNumber < 0 ? (pid, -1) : (pid, diskNum);
                    if (!s_stats.TryGetValue(key, out var st))
                        st = (0, 0);
                    s_stats[key] = (st.read, st.write + data.TransferSize);
                }
            }
        };

        // 后台处理事件流
        Task.Run(() =>
        {
            try
            {
                source.Process();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ETW] source.Process 异常: {ex.Message}");
            }
        });
    }

    private static void StopEtwSession()
    {
        try
        {
            s_session?.Dispose();
        }
        catch
        {
            // 忽略关闭异常
        }
        s_session = null;
    }

    /// <summary>
    /// 周期性输出 JSON 统计到 stdout
    /// </summary>
    private static async Task OutputLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(s_intervalSec * 1000, token);
            }
            catch (TaskCanceledException)
            {
                break;
            }

            List<ProcessStat> procList;
            long diskRead = 0;
            long diskWrite = 0;

            lock (s_lock)
            {
                // 取出本周期统计并重置
                procList = new List<ProcessStat>(s_stats.Count);
                foreach (var kv in s_stats)
                {
                    if (kv.Value.read == 0 && kv.Value.write == 0) continue;
                    var name = s_pidToName.TryGetValue(kv.Key.pid, out var n) ? n : $"pid_{kv.Key.pid}";
                    procList.Add(new ProcessStat
                    {
                        pid = kv.Key.pid,
                        name = name,
                        read = kv.Value.read,
                        write = kv.Value.write
                    });
                }
                s_stats.Clear();

                // diskNumber=-1 时汇总所有物理盘；否则取指定盘
                if (s_diskNumber < 0)
                {
                    foreach (var kv in s_diskStats)
                    {
                        diskRead += kv.Value.read;
                        diskWrite += kv.Value.write;
                    }
                }
                else if (s_diskStats.TryGetValue(s_diskNumber, out var ds))
                {
                    diskRead = ds.read;
                    diskWrite = ds.write;
                }
                s_diskStats.Clear();
            }

            // 排序：总量降序
            procList.Sort((a, b) => (b.read + b.write).CompareTo(a.read + a.write));

            var payload = new StatsPayload
            {
                type = "stats",
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                intervalSec = s_intervalSec,
                diskNumber = s_diskNumber,
                diskRead = diskRead,
                diskWrite = diskWrite,
                processes = procList
            };

            Console.WriteLine(JsonSerializer.Serialize(payload));
        }
    }
}

internal sealed class ProcessStat
{
    public int pid { get; set; }
    public string name { get; set; } = "";
    public long read { get; set; }
    public long write { get; set; }
}

internal sealed class StatsPayload
{
    public string type { get; set; } = "";
    public long timestamp { get; set; }
    public int intervalSec { get; set; }
    public int diskNumber { get; set; }
    public long diskRead { get; set; }
    public long diskWrite { get; set; }
    public List<ProcessStat> processes { get; set; } = new();
}
