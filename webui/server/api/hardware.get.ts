import si from 'systeminformation'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Champs de base, lus par tous les drivers
const BASE_FIELDS = ['name', 'utilization.gpu', 'memory.used', 'memory.total']
// Champs supplémentaires : température, consommation, limite de puissance appliquée et raisons de
// bridage. `clocks_event_reasons` est le nom des drivers récents (≥ 535 environ, 580 sur cette
// machine) ; un champ inconnu fait échouer TOUTE la requête, d'où le repli sur les champs de base.
const EXTRA_FIELDS = [
  'temperature.gpu',
  'power.draw',
  'enforced.power.limit', // power.limit renvoie [N/A] sur les GPU de portable, celui-ci non (60 W ici)
  'clocks_event_reasons.sw_thermal_slowdown', // le driver baisse les fréquences : trop chaud
  'clocks_event_reasons.hw_thermal_slowdown', // bridage matériel d'urgence : beaucoup trop chaud
  'clocks_event_reasons.sw_power_cap', // fréquences limitées pour rester sous la limite de puissance
]

const queryGpus = async (fields: string[]) => {
  const { stdout } = await execFileAsync('nvidia-smi', [
    `--query-gpu=${fields.join(',')}`,
    '--format=csv,noheader,nounits',
  ])
  return stdout.trim().split('\n').filter(Boolean).map((line) => line.split(',').map((v) => v.trim()))
}

// "[N/A]", "[Not Supported]"… → null
const num = (v?: string) => (v == null || v.startsWith('[') || v === '' ? null : Number(v))
const active = (v?: string) => (v == null || v.startsWith('[') ? null : v === 'Active')

// le driver ne change pas pendant que le serveur tourne : si les champs supplémentaires échouent une
// fois, on ne les redemande plus (le monitoring interroge toutes les 500 ms)
let extraFieldsSupported = true

async function readGpus() {
  let rows: string[][]
  let extended = extraFieldsSupported
  try {
    rows = await queryGpus(extended ? [...BASE_FIELDS, ...EXTRA_FIELDS] : BASE_FIELDS)
  } catch {
    if (!extended) return []
    try {
      rows = await queryGpus(BASE_FIELDS)
      extended = false
      extraFieldsSupported = false
    } catch {
      // nvidia-smi absent (pas de GPU Nvidia, ou drivers non installés)
      return []
    }
  }

  return rows.map(([model, loadPercent, memoryUsedMB, memoryTotalMB, temp, power, powerLimit, swThermal, hwThermal, powerCap]) => ({
    model,
    loadPercent: Number(loadPercent),
    memoryUsedMB: Number(memoryUsedMB),
    memoryTotalMB: Number(memoryTotalMB),
    temperatureC: extended ? num(temp) : null,
    powerW: extended ? num(power) : null,
    powerLimitW: extended ? num(powerLimit) : null,
    // bridé à cause de la chaleur (logiciel ou matériel) / de la limite de puissance
    thermalThrottle: extended ? (active(swThermal) || active(hwThermal)) ?? null : null,
    powerCapped: extended ? active(powerCap) : null,
  }))
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
