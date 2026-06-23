<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import DiskSelector from './components/DiskSelector.vue'
import SpeedCard from './components/SpeedCard.vue'
import SpeedChart from './components/SpeedChart.vue'
import ProcessList from './components/ProcessList.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import type { DiskInfo, DiskData } from './env'

const disks = ref<DiskInfo[]>([])
const selectedDisk = ref('')
const diskData = ref<DiskData | null>(null)
const historyData = ref<{ readSpeed: number; writeSpeed: number; timestamp: number }[]>([])
const isMonitoring = ref(false)
const showSettings = ref(false)
const currentInterval = ref(2)
let unsubscribe: (() => void) | null = null

const MAX_HISTORY = 60

const readSpeed = computed(() => diskData.value?.readSpeed ?? 0)
const writeSpeed = computed(() => diskData.value?.writeSpeed ?? 0)
const readChange = computed(() => diskData.value?.readChange ?? 0)
const writeChange = computed(() => diskData.value?.writeChange ?? 0)
const processes = computed(() => diskData.value?.processes ?? [])
const intervalSec = computed(() => diskData.value?.intervalSec ?? currentInterval.value)

onMounted(async () => {
  disks.value = await window.api.getDisks()
  if (disks.value.length > 0) {
    selectedDisk.value = disks.value[0].letter
    startMonitor()
  }
})

onUnmounted(() => {
  stopMonitor()
})

async function startMonitor() {
  if (!selectedDisk.value) return
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

async function onDiskChange(letter: string) {
  selectedDisk.value = letter
  await startMonitor()
}

async function onSettingsConfirm(sec: number) {
  currentInterval.value = sec
  await window.api.updateInterval(sec)
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

    <!-- 速度卡片 -->
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

    <!-- 实时曲线图 -->
    <div class="chart-section card">
      <SpeedChart :data="historyData" :interval-sec="intervalSec" />
    </div>

    <!-- 进程列表 -->
    <div class="process-section card">
      <ProcessList :processes="processes" :interval-sec="intervalSec" />
    </div>

    <!-- 设置面板 -->
    <SettingsPanel
      :visible="showSettings"
      :current-interval="currentInterval"
      @close="showSettings = false"
      @confirm="onSettingsConfirm"
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
