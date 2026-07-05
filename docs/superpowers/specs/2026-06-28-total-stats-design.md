# HardWatch 总量统计功能设计文档

## 概述

在现有实时统计功能基础上，新增"总量统计"页面。应用启动后持续采集硬盘读写数据并按进程名聚合，持久化存储到本地。用户可切换查看 1 天 / 2 天 / 3 天 / 1 周 / 1 个月 时间窗口内的累计读写总量，并支持清除缓存从零开始统计。

## 技术栈

复用现有技术栈：Electron + Vue 3 + TypeScript + electron-vite + Chart.js。不引入新依赖。

## 架构

```
Electron 主进程
  └── DiskMonitor (现有，复用采集循环)
        ├── 实时数据 → onData 回调 → IPC disk-data → 实时统计页面
        │
        └── 进程 I/O 差值 → TotalStatsAccumulator (新增)
                                ├── 内存小时桶 (currentBucket)
                                ├── 跨整点 flush → stats/{ISO小时}.json
                                ├── 启动恢复 (读取 current-bucket.json)
                                └── 清除缓存 (删除所有 stats/*.json + 重置内存)
                                      │
                                      │ IPC: query-stats / clear-stats
                                      │
Vue 3 渲染进程
  ├── Tab 切换: 实时统计 | 总量统计
  ├── 实时统计页面 (现有，保持不变)
  └── 总量统计页面 (新增)
        ├── StatsToolbar      - 时间段按钮组 + 清除统计按钮
        ├── StatsSummaryCard  - 读取/写入总量卡片
        ├── StatsChart        - 按小时/天的读写柱状图
        └── StatsProcessList  - 进程累计读写列表 + 占比条
```

## 数据流复用

总量统计**不新建采集循环**，复用 `DiskMonitor.collect()` 已计算出的进程 I/O 差值。在 `collect()` 末尾，将进程差值数组传入 `TotalStatsAccumulator.accumulate(processDeltas, diskReadBytes, diskWriteBytes)`。这一步对现有实时数据流无任何影响（只读取已计算的差值，不修改）。

## 数据存储模型

### 存储位置

`app.getPath('userData')/stats/`（即 `C:\Users\<user>\AppData\Roaming\HardWatch\stats\`）。

### 文件结构

```
stats/
├── current-bucket.json     # 当前小时桶（内存为主，定期落盘）
├── 2026-06-28T20.json       # 历史小时桶（按 ISO 小时命名）
├── 2026-06-28T21.json
└── 2026-06-29T08.json
```

### 数据格式

每个 JSON 文件代表一个完整小时桶：

```ts
interface StatsBucket {
  hourStart: number        // 该小时起始的 timestamp（ms）
  processes: {             // 按进程名聚合
    [name: string]: {
      readBytes: number    // 该小时内累计读取量
      writeBytes: number   // 该小时内累计写入量
    }
  }
  diskReadBytes: number    // 该小时磁盘读取总量
  diskWriteBytes: number   // 该小时磁盘写入总量
}
```

### 桶的生命周期

1. **内存桶**：`TotalStatsAccumulator` 内存中维护 `currentBucket`，采集循环每轮累加
2. **落盘时机**：检测到当前时间跨过整点（`new Date().getHours()` 变化），或应用退出（`app.on('before-quit')`），把 `currentBucket` 写入 `stats/{ISO小时}.json`，同时更新 `current-bucket.json`
3. **启动恢复**：应用启动时读取 `current-bucket.json`，若其 `hourStart` 与当前小时一致则继续累加，否则归档为历史桶并新建空桶

### 查询逻辑

用户选择时间段后，主进程扫描 `stats/` 目录，读取时间窗口内的所有小时桶文件，按进程名合并 `readBytes/writeBytes`，同时聚合磁盘总量和按时间分桶的图表数据。

| 时间段 | 小时桶数量 | 图表粒度 | X 轴标签 |
|--------|-----------|----------|---------|
| 1 天 | 24 | 按小时 | `HH:00` |
| 2 天 | 48 | 按小时 | 每 6 小时一个 |
| 3 天 | 72 | 按小时 | 每 6 小时一个 |
| 1 周 | 168 | 按天聚合 | `MM-DD` |
| 1 个月 | 720 | 按天聚合 | `MM-DD`，`maxTicksLimit: 10` |

无数据的小时/天显示空位（不补零柱），保持时间轴连续。

### 清理策略

启动时扫描 `stats/` 目录，删除超过 31 天的桶文件（自动过期，避免无限增长）。

## 清除缓存功能

### 触发入口

在总量统计页面的时间段选择器旁，放置"清除统计"按钮（红色描边次要样式，避免误触）。点击后弹出确认对话框（复用毛玻璃弹窗风格），二次确认后执行清除。

### 清除范围

- 删除 `stats/` 目录下所有 `.json` 文件
- 清空内存中的 `currentBucket`，新建空桶
- 不影响实时统计页面和监控循环（监控继续运行，新数据从 0 开始累加）

### 交互细节

- 确认弹窗文案："此操作将清除所有历史统计数据，且不可恢复。确定从零开始统计吗？"
- 清除成功后显示短暂 toast 提示"统计已重置"
- 清除后页面自动刷新，显示空状态

## IPC 通信

新增 IPC handler：

| Channel | 方向 | 行为 |
|---|---|---|
| `query-stats` | renderer→main | 传入时间段（`'1d'/'2d'/'3d'/'1w'/'1m'`），返回聚合后的总量数据 |
| `clear-stats` | renderer→main | 删除所有 stats 文件 + 重置内存桶，返回 boolean |

新增 preload API：

```ts
queryStats: (range: string) => Promise<TotalStatsData>
clearStats: () => Promise<boolean>
```

返回数据结构：

```ts
interface TotalStatsData {
  totalReadBytes: number
  totalWriteBytes: number
  processes: { name: string; readBytes: number; writeBytes: number }[]
  chartBuckets: { label: string; readBytes: number; writeBytes: number }[]
  rangeLabel: string  // 如 "1 天" / "1 周"，供 UI 显示
}
```

## 界面设计

### Tab 切换

在现有 header 下方新增一行 Tab 按钮：**实时统计**（默认）| **总量统计**。点击切换 `.app-container` 主体内容。header（logo + 盘符选择器 + 设置按钮）保持不变，两个页面共享。

### 总量统计页面布局

```
.app-container (总量统计页面)
├── header (共享，不变)
├── .stats-toolbar (工具栏)
│   ├── 时间段按钮组：1天 | 2天 | 3天 | 1周 | 1月
│   └── 清除统计按钮（右侧，红色描边）
├── .stats-summary (grid 1fr 1fr)
│   ├── 读取总量卡片（蓝）
│   └── 写入总量卡片（紫）
├── .stats-chart-section.card (180px)
│   └── 按小时/天的读写柱状图
└── .stats-process-section.card (flex 1)
    └── 进程总量列表
```

### 美学方向

延续现有 GitHub Dark 风格，但因为是"长期累计"语境，视觉上更沉稳、报表化，区别于实时页面的跳动感。

**排版差异化**：
- 总量数值：32px 700 + `tabular-nums` + `letter-spacing: -0.02em`，强调分量感
- 时间段按钮标签：11px 600 大写字距 0.08em（与 table th 一致）

### 时间段按钮组（segmented control）

- 容器：`inline-flex`，`background: var(--bg-secondary)`，`border-radius: 8px`，`padding: 3px`，`1px solid var(--border)`
- 选中态：`background: var(--accent-blue)`，文字白色，`box-shadow: 0 0 0 1px rgba(88,166,255,0.3)` 微光晕
- 未选中：透明背景，`var(--text-secondary)`，hover 变 `var(--text-primary)` + `var(--bg-hover)`
- 切换 `transition: all 0.18s cubic-bezier(0.4,0,0.2,1)`
- "清除统计"按钮独立右侧，`color: var(--accent-red)`，`border: 1px solid rgba(248,81,73,0.3)`，hover 填充 `rgba(248,81,73,0.1)`

### 总量卡片

复用 SpeedCard 的图标+标签+大数值结构：
- 数值：32px / 700 / `tabular-nums` / `letter-spacing: -0.02em`
- 数值下方小字：`var(--text-muted)` 12px，显示"过去 N 天累计"
- 去掉变化率箭头和 `/Ns` 后缀
- 卡片底部 2px 色条（读取蓝 / 写入紫），`opacity: 0.6`

### 小时柱状图

Chart.js bar，深色主题：
- 双柱并排：读取 `#58a6ff` + 写入 `#bc8cff`，`barPercentage: 0.7`，`categoryPercentage: 0.8`
- 网格线 `rgba(48,54,61,0.5)`
- tooltip 复用 SpeedChart 的 `#1c2128` 深色样式

### 进程总量列表

表格结构：
- 列：进程名(35%) / 累计读取(20%, 蓝) / 累计写入(20%, 紫) / 总量(12%) / 占比(13%)
- 按累计总量（读+写）降序
- 占比列：横向迷你条形（6px 高，3px 圆角，蓝色填充按百分比）+ 右侧百分比数字
- 前 3 名进程行加 `background: rgba(88,166,255,0.04)` 极淡高亮
- 数字列 `tabular-nums` 右对齐
- 顶部 ℹ 提示图标，文案："读写量为该进程在所有盘符的全局累计总量，Windows 未提供按盘符拆分的进程级 I/O 接口"
- 空状态：硬盘 SVG + "暂无统计数据" + 副文案"应用运行后将开始记录读写总量"

### 动效

- Tab 切换时总量页面整体 `fadeIn` + `translateY(8px → 0)`，0.3s
- 时间段切换时柱状图和列表数据用 `opacity 0.2s` 交叉淡入
- 清除确认弹窗复用 SettingsPanel 的双层 Transition（overlay fade + panel slide）

## 盘符关系与已知限制

- **进程列表的读写总量**是全局的（受 Windows 限制，无按盘符拆分的进程级 I/O 接口），页面已标注说明
- **磁盘读写总量**：`StatsBucket` 中存储的 `diskReadBytes/diskWriteBytes` 是采集时所选盘符的数据。若用户中途切换盘符，历史桶会混有不同盘符的磁盘数据。因此磁盘总量卡片显示的是"采集期间所选盘符的累计读写量"，切换盘符后新数据归属新盘符，历史数据保留原盘符。这是可接受的近似，因为总量统计的核心价值在进程级数据

## 新增文件

```
src/main/
  └── statsAccumulator.ts          # TotalStatsAccumulator 类
src/renderer/src/components/
  ├── StatsToolbar.vue             # 时间段按钮组 + 清除按钮
  ├── StatsSummaryCard.vue         # 总量卡片
  ├── StatsChart.vue               # 柱状图
  ├── StatsProcessList.vue         # 进程总量列表
  └── ConfirmDialog.vue            # 通用确认弹窗（复用毛玻璃风格）
```

## 修改文件

```
src/main/index.ts                  # 新增 query-stats / clear-stats IPC
src/main/monitor.ts                # collect() 末尾调用 accumulator.accumulate()
src/preload/index.ts               # 新增 queryStats / clearStats API
src/renderer/src/App.vue           # Tab 切换逻辑 + 页面编排
src/renderer/src/env.d.ts          # 新增 TotalStatsData 等类型
```
