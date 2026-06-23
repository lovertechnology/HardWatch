<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  currentInterval: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', interval: number): void
}>()

const sliderValue = ref(props.currentInterval)

// 格式化显示时间
const intervalLabel = computed(() => {
  const v = sliderValue.value
  if (v < 60) return `${v} 秒`
  const min = Math.floor(v / 60)
  const sec = v % 60
  return sec === 0 ? `${min} 分钟` : `${min} 分 ${sec} 秒`
})

function onConfirm() {
  emit('confirm', sliderValue.value)
  emit('close')
}

function onCancel() {
  sliderValue.value = props.currentInterval
  emit('close')
}

function onOverlayClick() {
  sliderValue.value = props.currentInterval
  emit('close')
}
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="overlay" @click.self="onOverlayClick">
      <Transition name="slide">
        <div v-if="visible" class="glass-panel" @click.stop>
          <div class="panel-header">
            <span class="panel-title">设置</span>
            <button class="close-btn" @click="onCancel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="panel-body">
            <div class="setting-group">
              <div class="setting-label">
                <span>刷新间隔</span>
                <span class="setting-value">{{ intervalLabel }}</span>
              </div>
              <div class="slider-wrapper">
                <span class="slider-min">1s</span>
                <input
                  type="range"
                  v-model.number="sliderValue"
                  min="1"
                  max="120"
                  step="1"
                  class="slider"
                />
                <span class="slider-max">120s</span>
              </div>
              <div class="setting-hint">
                统计周期越长，数据越平滑；周期越短，实时性越高
              </div>
            </div>
          </div>

          <div class="panel-footer">
            <button class="btn btn-cancel" @click="onCancel">取消</button>
            <button class="btn btn-confirm" @click="onConfirm">确定</button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-panel {
  width: 380px;
  background: rgba(28, 33, 40, 0.82);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}
.close-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.panel-body {
  padding: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 500;
}

.setting-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-blue);
  font-variant-numeric: tabular-nums;
}

.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-min,
.slider-max {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 28px;
  text-align: center;
}

.slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-secondary);
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-blue);
  cursor: pointer;
  box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.15);
  transition: box-shadow 0.15s;
}

.slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 6px rgba(88, 166, 255, 0.25);
}

.slider::-webkit-slider-thumb:active {
  box-shadow: 0 0 0 8px rgba(88, 166, 255, 0.2);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}
.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.btn-confirm {
  background: var(--accent-blue);
  color: #fff;
}
.btn-confirm:hover {
  background: #79b8ff;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-leave-active {
  transition: all 0.18s ease-in;
}
.slide-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(8px);
}
.slide-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(4px);
}
</style>
