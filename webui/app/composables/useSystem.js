export function useSystem() {
  const cpuBrand = useState('system-cpu-brand', () => null)
  const cpuCores = useState('system-cpu-cores', () => null)
  const cpuPhysicalCores = useState('system-cpu-physical-cores', () => null)
  const ramTotalMB = useState('system-ram-total', () => null)
  const gpus = useState('system-gpus', () => [])

  async function load() {
    if (cpuBrand.value) return // déjà chargé, config statique
    const system = await $fetch('/api/system')
    cpuBrand.value = system.cpu.brand
    cpuCores.value = system.cpu.cores
    cpuPhysicalCores.value = system.cpu.physicalCores
    ramTotalMB.value = system.ramTotalMB
    gpus.value = system.gpu
  }

  onMounted(load)

  return { cpuBrand, cpuCores, cpuPhysicalCores, ramTotalMB, gpus }
}
