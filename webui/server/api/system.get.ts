import si from 'systeminformation'

export default defineEventHandler(async () => {
  const [cpu, mem, graphics] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
  ])

  const gpus = graphics.controllers
    .filter(c => c.vram)
    .map(c => ({
      model: c.model,
      vramMB: c.vram,
    }))

  return {
    cpu: {
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
    },
    ramTotalMB: Math.round(mem.total / 1024 / 1024),
    gpu: gpus,
  }
})
