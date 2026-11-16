let interval = null

// Historique pour les mini-courbes de la barre de monitoring : 120 mesures × 500 ms = 60 s
export const HISTORY_SIZE = 120
const POLL_MS = 500

export function useHardware() {
  const cpuLoad = useState('hardware-cpu', () => null)
  const ramLoad = useState('hardware-ram-percent', () => null)
  const ramUsedMB = useState('hardware-ram-used', () => null)
  const ramTotalMB = useState('hardware-ram-total', () => null)
  const gpus = useState('hardware-gpus', () => [])
  // { cpu: [..], ram: [..], gpu: { "<modèle de GPU>": { load: [..], temp: [..], power: [..] } } }, du plus ancien au plus récent
  const history = useState('hardware-history', () => ({ cpu: [], ram: [], gpu: {} }))

  // ajoute une mesure et ne garde que les HISTORY_SIZE dernières
  const push = (list, value) => {
    list.push(value ?? null)
    if (list.length > HISTORY_SIZE) list.shift()
  }

  async function refresh() {
    const [hardware] = await Promise.all([
      $fetch('/api/hardware'),
    ])
    cpuLoad.value = hardware.cpu.loadPercent
    ramLoad.value = hardware.ram.percent
    ramUsedMB.value = hardware.ram.usedMB
    ramTotalMB.value = hardware.ram.totalMB
    gpus.value = hardware.gpu

    const h = history.value
    push(h.cpu, hardware.cpu.loadPercent)
    push(h.ram, hardware.ram.percent)
    for (const gpu of hardware.gpu) {
      // ??= par série : un historique créé par une version précédente (rechargement à chaud) n'a pas
      // forcément toutes les listes
      const g = (h.gpu[gpu.model] ??= {})
      push((g.load ??= []), gpu.loadPercent)
      push((g.temp ??= []), gpu.temperatureC)
      push((g.power ??= []), gpu.powerW)
    }
  }

  onMounted(() => {
    if (!interval) {
      refresh()
      interval = setInterval(refresh, POLL_MS)
    }
  })

  return { cpuLoad, ramLoad, ramUsedMB, ramTotalMB, gpus, history, refresh }
}
