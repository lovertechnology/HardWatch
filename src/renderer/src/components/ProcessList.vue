<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
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

// 表头排序
type SortKey = 'name' | 'pid' | 'readBytes' | 'writeBytes' | 'total'
const sortKey = ref<SortKey>('total')
const sortOrder = ref<'asc' | 'desc'>('desc')

function sortBy(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = key === 'name' ? 'asc' : 'desc'
  }
}

function sortValue(p: ProcessIO, key: SortKey): number | string {
  if (key === 'total') return p.readBytes + p.writeBytes
  if (key === 'name') return p.name.toLowerCase()
  return p[key]
}

// 只显示有读写活动的进程，按当前排序键排序
const activeProcesses = computed(() => {
  const list = props.processes.filter((p) => p.readBytes > 0 || p.writeBytes > 0)
  const dir = sortOrder.value === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = sortValue(a, sortKey.value)
    const vb = sortValue(b, sortKey.value)
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
    return ((va as number) - (vb as number)) * dir
  })
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

// 右键菜单
const contextMenu = ref<{ visible: boolean; x: number; y: number; pid: number }>({
  visible: false, x: 0, y: 0, pid: 0
})

function onContextMenu(e: MouseEvent, proc: ProcessIO) {
  e.preventDefault()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, pid: proc.pid }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

async function openInExplorer() {
  const pid = contextMenu.value.pid
  closeContextMenu()
  await window.api.openProcessLocation(pid)
}

function onGlobalClick() {
  if (contextMenu.value.visible) closeContextMenu()
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
})
onUnmounted(() => {
  document.removeEventListener('click', onGlobalClick)
})
</script>

<template>
  <div class="process-container">
    <div class="process-header">
      <div class="process-title-row">
        <span class="process-title">进程读写详情</span>
        <span class="process-hint" title="进程列表按盘符筛选（exe路径/命令行引用），但读写量为该进程在所有盘符的全局总量，Windows 未提供按盘符拆分的进程级 I/O 接口">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>
      </div>
      <span class="process-count">{{ activeProcesses.length }} 个活跃进程</span>
    </div>
    <div class="table-wrapper">
      <table v-if="activeProcesses.length > 0">
        <thead>
          <tr>
            <th class="col-name sortable" @click="sortBy('name')">
              进程名
              <span class="sort-arrow" :class="{ active: sortKey === 'name' }">{{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-pid sortable" @click="sortBy('pid')">
              PID
              <span class="sort-arrow" :class="{ active: sortKey === 'pid' }">{{ sortKey === 'pid' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-speed sortable" @click="sortBy('readBytes')">
              读取量
              <span class="sort-arrow" :class="{ active: sortKey === 'readBytes' }">{{ sortKey === 'readBytes' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-speed sortable" @click="sortBy('writeBytes')">
              写入量
              <span class="sort-arrow" :class="{ active: sortKey === 'writeBytes' }">{{ sortKey === 'writeBytes' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-bar">活动</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="proc in activeProcesses"
            :key="proc.pid"
            class="fade-in"
            @contextmenu="onContextMenu($event, proc)"
          >
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

    <!-- 右键菜单 -->
    <Transition name="ctx-fade">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button class="ctx-item" @click="openInExplorer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          在文件浏览器中打开
        </button>
      </div>
    </Transition>
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

.process-title-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.process-hint {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
  cursor: help;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.process-hint:hover {
  opacity: 1;
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

.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}

.sortable:hover {
  color: var(--text-primary);
}

.sort-arrow {
  font-size: 9px;
  margin-left: 3px;
  color: var(--text-muted);
  opacity: 0.4;
}

.sort-arrow.active {
  color: var(--accent-blue);
  opacity: 1;
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

.context-menu {
  position: fixed;
  z-index: 2000;
  min-width: 180px;
  background: rgba(28, 33, 40, 0.92);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  padding: 4px;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s;
}

.ctx-item:hover {
  background: var(--accent-blue);
  color: #fff;
}

.ctx-fade-enter-active {
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.ctx-fade-leave-active {
  transition: all 0.1s ease-in;
}
.ctx-fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.ctx-fade-leave-to {
  opacity: 0;
}
</style>
