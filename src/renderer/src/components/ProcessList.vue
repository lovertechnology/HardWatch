<script setup lang="ts">
import { computed } from 'vue'
import type { ProcessIO } from '../env'

const props = defineProps<{
  processes: ProcessIO[]
  intervalSec: number
}>()

function formatSpeed(totalBytes: number): string {
  if (totalBytes < 1024) return totalBytes.toFixed(0) + ' B/' + formatIntervalSuffix(props.intervalSec)
  if (totalBytes < 1024 * 1024) return (totalBytes / 1024).toFixed(1) + ' KB/' + formatIntervalSuffix(props.intervalSec)
  return (totalBytes / (1024 * 1024)).toFixed(1) + ' MB/' + formatIntervalSuffix(props.intervalSec)
}

function formatIntervalSuffix(sec: number): string {
  if (sec < 60) return sec + 's'
  if (sec % 60 === 0) return (sec / 60) + 'min'
  return Math.floor(sec / 60) + 'm' + (sec % 60) + 's'
}

// 只显示有读写活动的进程，按总量降序取前 30
const activeProcesses = computed(() => {
  return props.processes
    .filter((p) => p.readBytes > 0 || p.writeBytes > 0)
    .slice(0, 30)
})

function speedBarWidth(speed: number, maxSpeed: number): string {
  if (maxSpeed === 0) return '0%'
  return Math.min((speed / maxSpeed) * 100, 100) + '%'
}

const maxTotalSpeed = computed(() => {
  if (activeProcesses.value.length === 0) return 1
  return activeProcesses.value.reduce((max, p) => {
    const total = p.readBytes + p.writeBytes
    return total > max ? total : max
  }, 0)
})
</script>

<template>
  <div class="process-container">
    <div class="process-header">
      <span class="process-title">进程读写详情</span>
      <span class="process-count">{{ activeProcesses.length }} 个活跃进程</span>
    </div>
    <div class="table-wrapper">
      <table v-if="activeProcesses.length > 0">
        <thead>
          <tr>
            <th class="col-name">进程名</th>
            <th class="col-pid">PID</th>
            <th class="col-speed">读取量</th>
            <th class="col-speed">写入量</th>
            <th class="col-bar">活动</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="proc in activeProcesses" :key="proc.pid" class="fade-in">
            <td class="col-name">
              <span class="process-name">{{ proc.name }}</span>
            </td>
            <td class="col-pid">
              <span class="pid-badge">{{ proc.pid }}</span>
            </td>
            <td class="col-speed">
              <span class="speed-read">{{ formatSpeed(proc.readBytes) }}</span>
            </td>
            <td class="col-speed">
              <span class="speed-write">{{ formatSpeed(proc.writeBytes) }}</span>
            </td>
            <td class="col-bar">
              <div class="bar-container">
                <div
                  class="bar bar-read"
                  :style="{ width: speedBarWidth(proc.readBytes, maxTotalSpeed) }"
                ></div>
                <div
                  class="bar bar-write"
                  :style="{ width: speedBarWidth(proc.writeBytes, maxTotalSpeed) }"
                ></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <p>暂无活跃的读写进程</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.process-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.process-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 10px;
}

.process-title {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.process-count {
  font-size: 11px;
  color: var(--text-muted);
}

.table-wrapper {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.col-name {
  width: 35%;
}
.col-pid {
  width: 12%;
}
.col-speed {
  width: 18%;
}
.col-bar {
  width: 17%;
}

.process-name {
  font-weight: 500;
  font-size: 13px;
}

.pid-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 1px 6px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}

.speed-read {
  color: var(--accent-blue);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.speed-write {
  color: var(--accent-purple);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.bar-container {
  display: flex;
  gap: 2px;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
  min-width: 0;
}

.bar-read {
  background: var(--accent-blue);
}

.bar-write {
  background: var(--accent-purple);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
