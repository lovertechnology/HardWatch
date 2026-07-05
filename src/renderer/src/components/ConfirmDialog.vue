<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

function onConfirm() {
  emit('confirm')
  emit('close')
}

function onCancel() {
  emit('close')
}
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="overlay" @click.self="onCancel">
      <Transition name="slide">
        <div v-if="visible" class="glass-panel" @click.stop>
          <div class="panel-header">
            <span class="panel-title">{{ title }}</span>
            <button class="close-btn" @click="onCancel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="panel-body">
            <p class="dialog-message">{{ message }}</p>
          </div>
          <div class="panel-footer">
            <button class="btn btn-cancel" @click="onCancel">{{ cancelText || '取消' }}</button>
            <button class="btn btn-danger" @click="onConfirm">{{ confirmText || '确定' }}</button>
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

.dialog-message {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
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

.btn-danger {
  background: var(--accent-red);
  color: #fff;
}
.btn-danger:hover {
  background: #ff6b63;
}

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
