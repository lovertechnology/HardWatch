<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { StatsProcess } from '../env'

const props = defineProps<{
  processes: StatsProcess[]
}>()

const maxTotal = computed(() => {
  if (props.processes.length === 0) return 1
  return props.processes.reduce((max, p) => {
    const total = p.readBytes + p.writeBytes
    return total > max ? total : max
  }, 0) || 1
})

const totalAll = computed(() => {
  return props.processes.reduce((sum, p) => sum + p.readBytes + p.writeBytes, 0)
})

// 表头排序
type SortKey = 'name' | 'readBytes' | 'writeBytes' | 'total'
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

const sortedProcesses = computed(() => {
  const dir = sortOrder.value === 'asc' ? 1 : -1
  return [...props.processes].sort((a, b) => {
    if (sortKey.value === 'name') return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir
    if (sortKey.value === 'total') return ((a.readBytes + a.writeBytes) - (b.readBytes + b.writeBytes)) * dir
    return ((a[sortKey.value] as number) - (b[sortKey.value] as number)) * dir
  })
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes.toFixed(0) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function percent(p: StatsProcess): number {
  const total = p.readBytes + p.writeBytes
  if (totalAll.value === 0) return 0
  return Math.round((total / totalAll.value) * 100)
}

function barWidth(p: StatsProcess): string {
  const total = p.readBytes + p.writeBytes
  return Math.max(2, (total / maxTotal.value) * 100) + '%'
}

// 右键菜单
const contextMenu = ref<{ visible: boolean; x: number; y: number; name: string }>({
  visible: false, x: 0, y: 0, name: ''
})

function onContextMenu(e: MouseEvent, proc: StatsProcess) {
  e.preventDefault()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, name: proc.name }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

async function openInExplorer() {
  const name = contextMenu.value.name
  closeContextMenu()
  await window.api.openProcessLocationByName(name)
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
  <div class="process-list">
    <div class="process-title-row">
      <span class="process-title">进程累计读写</span>
      <span class="process-hint" title="读写量为该进程在所有盘符的全局累计总量，Windows 未提供按盘符拆分的进程级 I/O 接口">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </span>
    </div>

    <div v-if="processes.length === 0" class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
      <div class="empty-title">暂无统计数据</div>
      <div class="empty-sub">应用运行后将开始记录读写总量</div>
    </div>

    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="col-name sortable" @click="sortBy('name')">
              进程名
              <span class="sort-arrow" :class="{ active: sortKey === 'name' }">{{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-num sortable" @click="sortBy('readBytes')">
              累计读取
              <span class="sort-arrow" :class="{ active: sortKey === 'readBytes' }">{{ sortKey === 'readBytes' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-num sortable" @click="sortBy('writeBytes')">
              累计写入
              <span class="sort-arrow" :class="{ active: sortKey === 'writeBytes' }">{{ sortKey === 'writeBytes' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-num sortable" @click="sortBy('total')">
              总量
              <span class="sort-arrow" :class="{ active: sortKey === 'total' }">{{ sortKey === 'total' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
            <th class="col-pct">占比</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(p, i) in sortedProcesses"
            :key="p.name"
            :class="{ 'top-row': i < 3 }"
            @contextmenu="onContextMenu($event, p)"
          >
            <td class="col-name">{{ p.name }}</td>
            <td class="col-num read">{{ formatBytes(p.readBytes) }}</td>
            <td class="col-num write">{{ formatBytes(p.writeBytes) }}</td>
            <td class="col-num total">{{ formatBytes(p.readBytes + p.writeBytes) }}</td>
            <td class="col-pct">
              <div class="pct-cell">
                <div class="pct-bar">
                  <div class="pct-fill" :style="{ width: barWidth(p) }"></div>
                </div>
                <span class="pct-text">{{ percent(p) }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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
.process-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.process-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.process-title {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.process-hint {
  color: var(--text-muted);
  cursor: help;
  display: flex;
  align-items: center;
}

.table-wrapper {
  flex: 1;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-card);
}

th {
  text-align: left;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

th.col-num,
td.col-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

th.col-pct,
td.col-pct {
  text-align: right;
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

td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.4);
  color: var(--text-primary);
}

tbody tr:hover {
  background: var(--bg-hover);
}

tr.top-row {
  background: rgba(88, 166, 255, 0.04);
}

tr.top-row:hover {
  background: rgba(88, 166, 255, 0.08);
}

.col-name {
  color: var(--text-primary);
}

td.read {
  color: var(--accent-blue);
}

td.write {
  color: var(--accent-purple);
}

td.total {
  color: var(--text-primary);
  font-weight: 600;
}

.pct-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.pct-bar {
  width: 60px;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.pct-fill {
  height: 100%;
  background: var(--accent-blue);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.pct-text {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
}

.empty-title {
  font-size: 14px;
  color: var(--text-secondary);
}

.empty-sub {
  font-size: 12px;
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
