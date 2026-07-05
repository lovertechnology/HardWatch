<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  bytes: number
  rangeLabel: string
  type: 'read' | 'write'
}>()

const formattedValue = computed(() => formatBytes(props.bytes))

const iconColor = computed(() => {
  return props.type === 'read' ? 'var(--accent-blue)' : 'var(--accent-purple)'
})

const accentColor = computed(() => {
  return props.type === 'read' ? '#58a6ff' : '#bc8cff'
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes.toFixed(0) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  if (bytes < 1024 * 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + ' TB'
}
</script>

<template>
  <div class="stats-card card">
    <div class="card-header">
      <div class="icon-wrapper" :style="{ color: iconColor }">
        <svg v-if="type === 'read'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <span class="card-label">{{ label }}</span>
    </div>
    <div class="stats-value">{{ formattedValue }}</div>
    <div class="stats-sub">过去 {{ rangeLabel }} 累计</div>
    <div class="accent-bar" :style="{ background: accentColor }"></div>
  </div>
</template>

<style scoped>
.stats-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-wrapper {
  display: flex;
  align-items: center;
}

.card-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.stats-value {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.stats-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.accent-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.6;
}
</style>
