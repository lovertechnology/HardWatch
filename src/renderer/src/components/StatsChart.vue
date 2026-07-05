<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { StatsChartBucket } from '../env.d'

Chart.register(...registerables)

const props = defineProps<{
  data: StatsChartBucket[]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes.toFixed(0) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function initChart() {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: '读取',
          data: [],
          backgroundColor: '#58a6ff',
          borderRadius: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: '写入',
          data: [],
          backgroundColor: '#bc8cff',
          borderRadius: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: { mode: 'index', intersect: false },
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
            padding: 12
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
            label: (ctx) => `${ctx.dataset.label}: ${formatBytes(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#6e7681',
            font: { size: 10 },
            maxRotation: 0,
            maxTicksLimit: 10
          }
        },
        y: {
          grid: { color: 'rgba(48, 54, 61, 0.5)' },
          ticks: {
            color: '#6e7681',
            font: { size: 10 },
            callback: (value) => formatBytes(value as number),
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
    chart.data.labels = newData.map((d) => d.label)
    chart.data.datasets[0].data = newData.map((d) => d.readBytes)
    chart.data.datasets[1].data = newData.map((d) => d.writeBytes)
    chart.update('none')
  },
  { deep: true }
)

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>

<template>
  <div class="chart-container">
    <div class="chart-title">读写总量分布</div>
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
