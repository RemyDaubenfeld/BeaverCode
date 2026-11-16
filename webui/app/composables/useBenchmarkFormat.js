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

// Réglages de génération d'un run / d'un test (voir RUN_OPTIONS dans benchmark.py) → texte court.
// null = « valeur du modèle » ; options absentes = run antérieur à l'enregistrement des réglages.
export function formatRunOptions(options) {
  if (!options) return 'réglages non enregistrés (run antérieur)'
  const temp = options.temperature == null ? 'du modèle' : options.temperature
  const ctx = options.num_ctx == null ? 'du modèle' : options.num_ctx
  return `température ${temp} · contexte ${ctx} · ${options.num_predict} tokens max`
}

// Latence d'un modèle sur ses tests : (TTFT « à chaud », temps de chargement), en secondes.
// Seul le premier test paie le chargement du modèle en mémoire : on l'écarte du TTFT (le test au plus long
// load_sec) et on le rapporte à part. Même calcul que latency_summary() dans benchmark.py et
// latencySummary() dans results.service.ts.
export function latencySummary(tests) {
  let timed = (tests ?? []).filter((t) => t.ttft_sec != null)
  const loads = timed.map((t) => t.load_sec).filter((v) => v != null)
  const loadSec = loads.length ? Math.max(...loads) : null
  if (timed.length >= 2 && loads.length) {
    const cold = timed.reduce((a, b) => ((b.load_sec ?? 0) > (a.load_sec ?? 0) ? b : a))
    timed = timed.filter((t) => t !== cold)
  }
  const ttfts = timed.map((t) => t.ttft_sec).sort((a, b) => a - b)
  if (!ttfts.length) return { ttftSec: null, loadSec }
  const mid = Math.floor(ttfts.length / 2)
  return { ttftSec: ttfts.length % 2 ? ttfts[mid] : (ttfts[mid - 1] + ttfts[mid]) / 2, loadSec }
}

// secondes → « 0.21 s », « 4.2 s », « — »
export function formatSeconds(sec) {
  if (sec == null) return '—'
  return sec < 1 ? `${sec.toFixed(2)} s` : `${sec.toFixed(1)} s`
}

// Info-bulle de la cellule TTFT d'un test : de quoi se compose ce temps
export function ttftTooltip(test) {
  if (test.ttft_sec == null) return 'Temps avant le premier token : non mesuré (run antérieur ou test en erreur)'
  const lines = [`Temps avant le premier token : ${formatSeconds(test.ttft_sec)}`]
  if (test.load_sec != null) lines.push(`  chargement du modèle : ${formatSeconds(test.load_sec)}`)
  if (test.prompt_eval_sec != null) {
    lines.push(`  lecture du prompt : ${formatSeconds(test.prompt_eval_sec)}${test.prompt_tokens ? ` (${test.prompt_tokens} tokens)` : ''}`)
  }
  return lines.join('\n')
}

// Résumé de latence d'un modèle → « TTFT 0.21 s · chargement 4.2 s » (vide si rien de mesuré)
export function formatLatency(tests) {
  const { ttftSec, loadSec } = latencySummary(tests)
  const parts = []
  if (ttftSec != null) parts.push(`TTFT ${formatSeconds(ttftSec)}`)
  if (loadSec != null) parts.push(`chargement ${formatSeconds(loadSec)}`)
  return parts.join(' · ')
}

export function useBenchmarkFormat() {
  return { scoreColorClass, formatDuration, formatRunOptions, formatSeconds, ttftTooltip, formatLatency }
}
