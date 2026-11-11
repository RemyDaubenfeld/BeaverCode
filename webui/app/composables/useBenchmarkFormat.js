// Formatage partagé entre BenchmarkRunner.vue (résultats en direct) et les
// composants de l'onglet "Résultats" (runs stockés) — mêmes couleurs et même
// format de durée des deux côtés.

// Couleurs du barème étoilé / score final : rouge (1) -> vert foncé (5).
const scoreColors = {
  1: 'text-bc-danger',
  2: 'text-bc-orange',
  3: 'text-bc-warning',
  4: 'text-bc-green',
  5: 'text-bc-green-dark',
}

export function scoreColorClass(score) {
  return scoreColors[Math.round(score)] ?? 'text-bc-text-muted'
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

export function useBenchmarkFormat() {
  return { scoreColorClass, formatDuration }
}
