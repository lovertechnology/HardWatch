# HardWatch

实时监控硬盘读写的桌面端程序，支持进程级 I/O 统计和历史累计分析。

## 功能特性

### 实时统计

- **磁盘读写监控**：选择盘符后实时显示读写总量（梯形积分法精确计算）
- **进程详情**：显示影响当前盘符的活跃进程及其 I/O 量
- **动态图表**：实时折线图展示读写趋势
- **可调采样间隔**：1s - 120s 滑动条调节

### 总量统计

- **时间范围筛选**：1 天 / 2 天 / 3 天 / 1 周 / 1 个月
- **小时桶聚合存储**：按小时聚合进程 I/O，JSON 文件持久化到用户目录
- **柱状图分析**：按小时/天展示读写总量分布
- **进程累计排行**：Top 读写进程排序 + 占比可视化
- **清除统计**：一键清除所有历史数据

### 进程定位

- **右键菜单**：进程列表右键 → 在文件浏览器中打开
- **多方式回退查询**：WMI → Get-Process → Win32 API QueryFullProcessImageName
- **SYSTEM 进程支持**：通过 Win32 API 获取受保护进程路径

## 系统要求

- Windows 10/11
- 管理员权限（读取磁盘性能计数器需要）

## 构建与打包

### 开发环境

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build
```

### 打包可执行文件

```bash
# 打包为免安装版（win-unpacked 目录）
npx electron-builder --win --config electron-builder.yml

# 压缩为 zip 发送
powershell -Command "Compress-Archive -Path release\win-unpacked\* -DestinationPath release\HardWatch.zip"
```

打包产物位于 `release/` 目录：
- `win-unpacked/HardWatch.exe` — 双击运行
- `HardWatch.zip` — 发给别人解压运行

### 目录说明

| 目录 | 说明 | 打包后位置 |
|------|------|------------|
| `logs/` | 运行日志 | `C:\Users\<user>\AppData\Roaming\HardWatch\logs` |
| `stats/` | 总量统计数据 | `C:\Users\<user>\AppData\Roaming\HardWatch\stats` |
| `scripts/` | 运行时 PowerShell 脚本 | `C:\Users\<user>\AppData\Roaming\HardWatch\scripts` |

## 技术架构

### 数据采集

- **磁盘速率**：Windows `Get-Counter` API（比 WMI PerfFormattedData 更可靠）
- **磁盘总量**：梯形积分法 `(prevRate + curRate) / 2 * elapsed`
- **进程 I/O**：`wmic process get ReadTransferCount,WriteTransferCount` 累计值差值法
- **盘符过滤**：`Win32_Process.ExecutablePath` + `CommandLine` 路径匹配

### 数据存储

- **小时桶 JSON**：`stats/YYYY-MM-DDTHH.json`，按进程名聚合
- **启动恢复**：读取 `current-bucket.json`，跨整点归档
- **自动清理**：超过 31 天的桶文件自动删除

### 进程路径查询（回退策略）

1. `Get-CimInstance Win32_Process.ExecutablePath`
2. `Get-Process.Path`
3. `Get-Process.MainModule.FileName`
4. Win32 API `QueryFullProcessImageName`（SYSTEM 进程）

## 社区规范

### 问题反馈

- 提交 Issue 时请附带日志文件（`AppData\Roaming\HardWatch\logs`）
- 描述复现步骤、系统版本、预期行为与实际行为

### 代码贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/your-feature`)
3. 提交改动 (`git commit -m 'Add some feature'`)
4. 推送分支 (`git push origin feature/your-feature`)
5. 创建 Pull Request

### 开发约定

- **日志目录**：使用 `app.getPath('userData')`，不使用 `__dirname`（打包后为 asar 只读）
- **脚本目录**：运行时 PowerShell 脚本写入 `userData/scripts`
- **进程过滤**：系统进程（无 exe  path）仅 C 盘显示
- **已知限制**：Windows 未提供按盘符拆分的进程级 I/O API，进程读写量为全局总量

### 安全说明

- 程序需要管理员权限运行（读取磁盘性能计数器）
- 不收集任何用户数据，所有统计数据仅存储在本地用户目录
- 不联网，无远程通信功能

## 许可证

MIT License

---

**作者**：lovertechnology

**仓库**：https://github.com/lovertechnology/HardWatch