import si from 'systeminformation'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function readGpus() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ])

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [model, loadPercent, memoryUsedMB, memoryTotalMB] = line.split(',').map(s => s.trim())
        return {
          model,
          loadPercent: Number(loadPercent),
          memoryUsedMB: Number(memoryUsedMB),
          memoryTotalMB: Number(memoryTotalMB),
        }
      })
  } catch {
    // nvidia-smi absent (pas de GPU Nvidia, ou drivers non installés)
    return []
  }
}

export default defineEventHandler(async () => {
  const [cpu, mem, gpus] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    readGpus(),
  ])

  const ramUsedMB = Math.round((mem.total - mem.available) / 1024 / 1024)
  const ramTotalMB = Math.round(mem.total / 1024 / 1024)

  return {
    cpu: {
      loadPercent: Math.round(cpu.currentLoad),
    },
    ram: {
      usedMB: ramUsedMB,
      totalMB: ramTotalMB,
      percent: Math.round((ramUsedMB / ramTotalMB) * 100),
    },
    gpu: gpus,
  }
})
