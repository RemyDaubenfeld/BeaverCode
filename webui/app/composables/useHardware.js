let interval = null

export function useHardware() {
  const cpuLoad = useState('hardware-cpu', () => null)
  const ramLoad = useState('hardware-ram-percent', () => null)
  const ramUsedMB = useState('hardware-ram-used', () => null)
  const ramTotalMB = useState('hardware-ram-total', () => null)
  const gpus = useState('hardware-gpus', () => [])

  async function refresh() {
    const [hardware] = await Promise.all([
      $fetch('/api/hardware'),
    ])
    cpuLoad.value = hardware.cpu.loadPercent
    ramLoad.value = hardware.ram.percent
    ramUsedMB.value = hardware.ram.usedMB
    ramTotalMB.value = hardware.ram.totalMB
    gpus.value = hardware.gpu
  }

  onMounted(() => {
    if (!interval) {
      refresh()
      interval = setInterval(refresh, 500)
    }
  })

  return { cpuLoad, ramLoad, ramUsedMB, ramTotalMB, gpus, refresh }
}
