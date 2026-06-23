# HardWatch - 硬盘实时监控程序设计文档

## 概述

HardWatch 是一个 Windows 桌面程序，用于实时监控硬盘读写速度，并展示每个进程的读写详情。

## 技术栈

- **框架**: Electron + Vue 3 + TypeScript
- **构建工具**: electron-vite
- **图表**: Chart.js
- **数据采集**: PowerShell 命令（通过 child_process 调用）
- **打包**: electron-builder (NSIS 安装包)

## 架构

```
Electron 主进程
  └── DiskMonitor (数据采集层)
        - PowerShell 定时采集（1秒间隔）
        - 盘符级读写速度
        - 进程级 I/O 数据
        │
        │ IPC (disk-data)
        │
Vue 3 渲染进程
  ├── DiskSelector   - 盘符选择下拉
  ├── SpeedCard      - 读写速度卡片
  ├── SpeedChart     - 实时速度曲线图
  └── ProcessList    - 进程读写列表
```

## 数据采集策略

1. **盘符级速度**: `Get-Counter '\PhysicalDisk(*)\Disk Read/Write Bytes/sec'`
2. **进程级 I/O**: `Get-Process` 获取每个进程的 ReadTransferBytes / WriteTransferBytes，通过差值计算实时速度
3. **采集频率**: 1 秒间隔
4. **权限**: 程序以管理员权限运行（electron-builder requestedExecutionLevel: requireAdministrator）

## 界面设计

暗色主题，布局从上到下：

1. **顶部**: 盘符选择下拉框
2. **速度卡片**: 左右两个卡片分别显示读取速度和写入速度，含变化趋势
3. **实时曲线图**: 最近 60 秒的读写速度折线图
4. **进程列表**: 表格显示进程名、PID、读取速度、写入速度

## 项目结构

```
HardWatch/
├── electron.vite.config.ts
├── package.json
├── src/
│   ├── main/
│   │   ├── index.ts          # Electron 入口
│   │   └── monitor.ts        # 数据采集模块
│   ├── preload/
│   │   └── index.ts          # Preload 脚本
│   └── renderer/
│       ├── index.html
│       ├── src/
│       │   ├── App.vue
│       │   ├── main.ts
│       │   ├── style.css
│       │   └── components/
│       │       ├── DiskSelector.vue
│       │       ├── SpeedCard.vue
│       │       ├── SpeedChart.vue
│       │       └── ProcessList.vue
│       └── env.d.ts
├── resources/                 # 应用图标等资源
└── electron-builder.yml       # 打包配置
```

## 核心模块职责

| 模块 | 职责 |
|------|------|
| main/index.ts | Electron 入口，创建窗口，请求管理员权限 |
| main/monitor.ts | PowerShell 数据采集，解析，通过 IPC 推送 |
| DiskSelector.vue | 盘符选择下拉框 |
| SpeedCard.vue | 读写速度数字卡片，含趋势箭头 |
| SpeedChart.vue | Chart.js 实时折线图，60秒历史 |
| ProcessList.vue | 进程读写详情表格，按速度排序 |
