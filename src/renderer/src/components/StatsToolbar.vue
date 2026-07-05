<script setup lang="ts">
defineProps<{
  selectedRange: string
}>()

const emit = defineEmits<{
  (e: 'range-change', range: string): void
  (e: 'clear'): void
}>()

const ranges = [
  { key: '1d', label: '1天' },
  { key: '2d', label: '2天' },
  { key: '3d', label: '3天' },
  { key: '1w', label: '1周' },
  { key: '1m', label: '1月' }
]
</script>

<template>
  <div class="stats-toolbar">
    <div class="range-group">
      <button
        v-for="r in ranges"
        :key="r.key"
        class="range-btn"
        :class="{ active: selectedRange === r.key }"
        @click="emit('range-change', r.key)"
      >
        {{ r.label }}
      </button>
    </div>
    <button class="clear-btn" @click="emit('clear')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
      清除统计
    </button>
  </div>
</template>

<style scoped>
.stats-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.range-group {
  display: inline-flex;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 3px;
  border: 1px solid var(--border);
  gap: 2px;
}

.range-btn {
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.range-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.range-btn.active {
  background: var(--accent-blue);
  color: #fff;
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.3);
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid rgba(248, 81, 73, 0.3);
  background: transparent;
  color: var(--accent-red);
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-btn:hover {
  background: rgba(248, 81, 73, 0.1);
  border-color: rgba(248, 81, 73, 0.5);
}
</style>
