<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import DiskSelector from './components/DiskSelector.vue'
import SpeedCard from './components/SpeedCard.vue'
import SpeedChart from './components/SpeedChart.vue'
import ProcessList from './components/ProcessList.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import StatsToolbar from './components/StatsToolbar.vue'
import StatsSummaryCard from './components/StatsSummaryCard.vue'
import StatsChart from './components/StatsChart.vue'
import StatsProcessList from './components/StatsProcessList.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import type { DiskInfo, DiskData, TotalStatsData } from './env'

const disks = ref<DiskInfo[]>([])
const selectedDisk = ref<number>(-1)
const diskData = ref<DiskData | null>(null)
const historyData = ref<{ readSpeed: number; writeSpeed: number; timestamp: number }[]>([])
const isMonitoring = ref(false)
const showSettings = ref(false)
const currentInterval = ref(2)
let unsubscribe: (() => void) | null = null

const MAX_HISTORY = 60

// Tab 切换
const activeTab = ref<'realtime' | 'total'>('realtime')

// 总量统计
const statsData = ref<TotalStatsData | null>(null)
const selectedRange = ref('1d')
const showClearConfirm = ref(false)
const statsLoading = ref(false)

const readSpeed = computed(() => diskData.value?.readSpeed ?? 0)
const writeSpeed = computed(() => diskData.value?.writeSpeed ?? 0)
const readChange = computed(() => diskData.value?.readChange ?? 0)
const writeChange = computed(() => diskData.value?.writeChange ?? 0)
const processes = computed(() => diskData.value?.processes ?? [])
const intervalSec = computed(() => diskData.value?.intervalSec ?? currentInterval.value)

onMounted(async () => {
  disks.value = await window.api.getDisks()
  if (disks.value.length > 0) {
    selectedDisk.value = disks.value[0].number
    startMonitor()
  }
})

onUnmounted(() => {
  stopMonitor()
})

async function startMonitor() {
  if (selectedDisk.value < 0) return
  stopMonitor()
  historyData.value = []
  isMonitoring.value = true
  await window.api.startMonitor(selectedDisk.value)
  unsubscribe = window.api.onDiskData((data: DiskData) => {
    diskData.value = data
    historyData.value.push({
      readSpeed: data.readSpeed,
      writeSpeed: data.writeSpeed,
      timestamp: data.timestamp
    })
    if (historyData.value.length > MAX_HISTORY) {
      historyData.value.splice(0, historyData.value.length - MAX_HISTORY)
    }
  })
}

function stopMonitor() {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  window.api.stopMonitor()
  isMonitoring.value = false
}

async function onDiskChange(diskNumber: number) {
  selectedDisk.value = diskNumber
  await startMonitor()
}

async function onSettingsConfirm(sec: number) {
  currentInterval.value = sec
  await window.api.updateInterval(sec)
}

// 总量统计
async function loadStats() {
  statsLoading.value = true
  try {
    statsData.value = await window.api.queryStats(selectedRange.value)
  } finally {
    statsLoading.value = false
  }
}

async function onTabChange(tab: 'realtime' | 'total') {
  activeTab.value = tab
  if (tab === 'total' && !statsData.value) {
    await loadStats()
  }
}

async function onRangeChange(range: string) {
  selectedRange.value = range
  await loadStats()
}

async function onClearStats() {
  const success = await window.api.clearStats()
  if (success) {
    await loadStats()
  }
}
</script>

<template>
  <div class="app-container">
    <!-- 顶部：标题 + 盘符选择 -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="20" height="12" rx="2"/>
            <circle cx="12" cy="12" r="3"/>
            <line x1="2" y1="10" x2="6" y2="10"/>
          </svg>
        </div>
        <h1 class="title">HardWatch</h1>
        <span class="monitor-badge" :class="{ active: isMonitoring }">
          {{ isMonitoring ? '监控中' : '未启动' }}
        </span>
      </div>
      <DiskSelector
        :disks="disks"
        :selected="selectedDisk"
        @change="onDiskChange"
        @settings="showSettings = true"
      />
    </header>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'realtime' }"
        @click="onTabChange('realtime')"
      >
        实时统计
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'total' }"
        @click="onTabChange('total')"
      >
        总量统计
      </button>
    </div>

    <!-- 实时统计页面 -->
    <template v-if="activeTab === 'realtime'">
      <div class="speed-cards">
        <SpeedCard
          label="读取量"
          :speed="readSpeed"
          :change="readChange"
          type="read"
          :interval-sec="intervalSec"
        />
        <SpeedCard
          label="写入量"
          :speed="writeSpeed"
          :change="writeChange"
          type="write"
          :interval-sec="intervalSec"
        />
      </div>

      <div class="chart-section card">
        <SpeedChart :data="historyData" :interval-sec="intervalSec" />
      </div>

      <div class="process-section card">
        <ProcessList :processes="processes" :interval-sec="intervalSec" />
      </div>
    </template>

    <!-- 总量统计页面 -->
    <template v-else>
      <StatsToolbar
        :selected-range="selectedRange"
        @range-change="onRangeChange"
        @clear="showClearConfirm = true"
      />

      <div class="speed-cards" v-if="statsData">
        <StatsSummaryCard
          label="读取总量"
          :bytes="statsData.totalReadBytes"
          :range-label="statsData.rangeLabel"
          type="read"
        />
        <StatsSummaryCard
          label="写入总量"
          :bytes="statsData.totalWriteBytes"
          :range-label="statsData.rangeLabel"
          type="write"
        />
      </div>

      <div class="chart-section card" v-if="statsData">
        <StatsChart :data="statsData.chartBuckets" />
      </div>

      <div class="process-section card" v-if="statsData">
        <StatsProcessList :processes="statsData.processes" />
      </div>
    </template>

    <!-- 设置面板 -->
    <SettingsPanel
      :visible="showSettings"
      :current-interval="currentInterval"
      @close="showSettings = false"
      @confirm="onSettingsConfirm"
    />

    <!-- 清除确认弹窗 -->
    <ConfirmDialog
      :visible="showClearConfirm"
      title="清除统计"
      message="此操作将清除所有历史统计数据，且不可恢复。确定从零开始统计吗？"
      confirm-text="清除"
      @close="showClearConfirm = false"
      @confirm="onClearStats"
    />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  color: var(--accent-blue);
  display: flex;
  align-items: center;
}

.title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.monitor-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.monitor-badge.active {
  color: var(--accent-green);
  border-color: rgba(63, 185, 80, 0.3);
  background: rgba(63, 185, 80, 0.08);
}

.tab-bar {
  display: flex;
  gap: 4px;
  padding: 0 2px;
}

.tab-btn {
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tab-btn.active {
  color: var(--accent-blue);
  background: rgba(88, 166, 255, 0.1);
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 2px;
  background: var(--accent-blue);
  border-radius: 1px;
}

.speed-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.chart-section {
  flex-shrink: 0;
  height: 180px;
  padding: 12px 14px;
}

.process-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 12px 0 0 0;
}
</style>
