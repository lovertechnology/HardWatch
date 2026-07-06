<script setup lang="ts">
import type { DiskInfo } from '../env'

defineProps<{
  disks: DiskInfo[]
  selected: number
}>()

const emit = defineEmits<{
  change: [diskNumber: number]
  settings: []
}>()

defineExpose({}) // ensure component is properly handled
</script>

<template>
  <div class="disk-selector">
    <label class="selector-label">物理硬盘</label>
    <select
      :value="selected"
      @change="emit('change', Number(($event.target as HTMLSelectElement).value))"
    >
      <option :value="-1">全部物理硬盘</option>
      <option v-for="disk in disks" :key="disk.number" :value="disk.number">
        {{ disk.name }}<span v-if="disk.letters && disk.letters.length"> ({{ disk.letters.join(', ') }})</span>
      </option>
    </select>
    <button class="settings-btn" @click="$emit('settings')" title="设置">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.disk-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selector-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px 7px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.settings-btn:hover {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}
</style>
