<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  speed: number
  change: number
  type: 'read' | 'write'
  intervalSec: number
}>()

const formattedSpeed = computed(() => {
  return formatBytes(props.speed) + '/' + formatIntervalSuffix(props.intervalSec)
})

const changeText = computed(() => {
  if (Math.abs(props.change) < 0.1) return '0%'
  const sign = props.change > 0 ? '+' : ''
  return sign + props.change.toFixed(1) + '%'
})

const changeClass = computed(() => {
  if (Math.abs(props.change) < 0.1) return 'neutral'
  return props.change > 0 ? 'up' : 'down'
})

const iconColor = computed(() => {
  return props.type === 'read' ? 'var(--accent-blue)' : 'var(--accent-purple)'
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes.toFixed(0) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function formatIntervalSuffix(sec: number): string {
  if (sec < 60) return sec + 's'
  if (sec % 60 === 0) return (sec / 60) + 'min'
  return Math.floor(sec / 60) + 'm' + (sec % 60) + 's'
}
</script>

<template>
  <div class="speed-card card">
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
    <div class="speed-value">{{ formattedSpeed }}</div>
    <div class="speed-change" :class="changeClass">
      <svg v-if="changeClass === 'up'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
      <svg v-else-if="changeClass === 'down'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
      <span>{{ changeText }}</span>
    </div>
  </div>
</template>

<style scoped>
.speed-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.speed-value {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
}

.speed-change {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 500;
}
.speed-change.up {
  color: var(--accent-green);
}
.speed-change.down {
  color: var(--accent-red);
}
.speed-change.neutral {
  color: var(--text-muted);
}
</style>
