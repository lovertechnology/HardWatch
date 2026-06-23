<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps<{
  data: { readSpeed: number; writeSpeed: number; timestamp: number }[]
  intervalSec: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null
let rafId: number | null = null

function formatSpeed(totalBytes: number): string {
  if (totalBytes < 1024) return totalBytes.toFixed(0) + ' B'
  if (totalBytes < 1024 * 1024) return (totalBytes / 1024).toFixed(1) + ' KB'
  return (totalBytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatIntervalSuffix(sec: number): string {
  if (sec < 60) return sec + 's'
  if (sec % 60 === 0) return (sec / 60) + 'min'
  return Math.floor(sec / 60) + 'm' + (sec % 60) + 's'
}

function initChart() {
  if (!canvasRef.value) return

  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '读取',
          data: [],
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88, 166, 255, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#58a6ff'
        },
        {
          label: '写入',
          data: [],
          borderColor: '#bc8cff',
          backgroundColor: 'rgba(188, 140, 255, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#bc8cff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#8b949e',
            font: { size: 11 },
            boxWidth: 12,
            boxHeight: 2,
            padding: 12,
            usePointStyle: false
          }
        },
        tooltip: {
          backgroundColor: '#1c2128',
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          borderColor: '#30363d',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatSpeed(ctx.parsed.y)}/${formatIntervalSuffix(props.intervalSec)}`
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: 'rgba(48, 54, 61, 0.4)',
            drawBorder: false
          },
          ticks: {
            color: '#6e7681',
            font: { size: 10 },
            maxTicksLimit: 8,
            maxRotation: 0
          }
        },
        y: {
          display: true,
          grid: {
            color: 'rgba(48, 54, 61, 0.4)',
            drawBorder: false
          },
          ticks: {
            color: '#6e7681',
            font: { size: 10 },
            callback: (value) => formatSpeed(value as number),
            maxTicksLimit: 5
          },
          beginAtZero: true
        }
      }
    }
  })
}

watch(
  () => props.data,
  (newData) => {
    if (!chart) return
    // 用 rAF 节流，避免数据到来时同步重绘阻塞渲染
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      if (!chart) return
      const labels = newData.map((d) => {
        const date = new Date(d.timestamp)
        return date.toLocaleTimeString('zh-CN', { minute: '2-digit', second: '2-digit' })
      })
      chart.data.labels = labels
      chart.data.datasets[0].data = newData.map((d) => d.readSpeed)
      chart.data.datasets[1].data = newData.map((d) => d.writeSpeed)
      chart.update('none')
      rafId = null
    })
  },
  { deep: true }
)

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>

<template>
  <div class="chart-container">
    <div class="chart-title">读写曲线 (每{{ formatIntervalSuffix(intervalSec) }})</div>
    <div class="chart-wrapper">
      <canvas ref="canvasRef"></canvas>
    </div>
  </div>
</template>

<style scoped>
.chart-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chart-title {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: 8px;
}

.chart-wrapper {
  flex: 1;
  min-height: 0;
}
</style>
