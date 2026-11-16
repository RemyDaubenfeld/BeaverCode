<template>
  <!-- Mini-courbe de l'historique récent (≈ 60 s), même encombrement que l'ancienne jauge (StatBarInline, supprimée).
       Échelle FIXE (min/max en props, 0–100 % par défaut) : une courbe plate en bas veut dire « faible »,
       pas « stable autour de la moyenne » comme le ferait une échelle automatique. -->
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="shrink-0 overflow-visible"
    :class="colorClass"
    role="img"
    :aria-label="summary"
  >
    <title>{{ summary }}</title>
    <!-- cadre discret : situe le haut et le bas de l'échelle -->
    <rect x="0.5" y="0.5" :width="width - 1" :height="height - 1" rx="3" class="fill-bc-surface-alt stroke-bc-border" />
    <template v-if="points.length > 1">
      <path :d="areaPath" fill="currentColor" fill-opacity="0.15" />
      <path :d="linePath" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      <!-- valeur actuelle -->
      <circle :cx="last.x" :cy="last.y" r="2" fill="currentColor" />
    </template>
  </svg>
</template>

<script setup>
const props = defineProps({
  values: { type: Array, default: () => [] }, // du plus ancien au plus récent (null = mesure absente)
  capacity: { type: Number, default: 120 }, // nb de points sur toute la largeur (120 × 500 ms = 60 s)
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  unit: { type: String, default: '%' },
  label: { type: String, default: '' },
  // classe de couleur (text-…) : la courbe et le remplissage utilisent currentColor
  colorClass: { type: String, default: 'text-bc-green' },
  width: { type: Number, default: 64 },
  height: { type: Number, default: 16 },
})

const PAD = 2 // marge intérieure : la courbe ne touche pas le cadre

// Les points sont ancrés à DROITE (le plus récent au bord droit) et espacés selon `capacity` : tant que
// l'historique n'est pas plein, la courbe n'occupe que la partie droite au lieu de s'étirer.
const points = computed(() => {
  const step = (props.width - PAD * 2) / (props.capacity - 1)
  const offset = props.capacity - props.values.length
  const range = props.max - props.min || 1
  return props.values
    .map((v, i) => {
      if (v == null) return null
      const clamped = Math.min(props.max, Math.max(props.min, v))
      return {
        x: PAD + (offset + i) * step,
        y: props.height - PAD - ((clamped - props.min) / range) * (props.height - PAD * 2),
      }
    })
    .filter(Boolean)
})

const last = computed(() => points.value[points.value.length - 1])
const linePath = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(''))
const areaPath = computed(() => {
  const base = props.height - PAD
  const first = points.value[0]
  return `${linePath.value}L${last.value.x.toFixed(1)},${base}L${first.x.toFixed(1)},${base}Z`
})

// info-bulle : min / moyenne / max sur la période affichée
const summary = computed(() => {
  const vals = props.values.filter((v) => v != null)
  if (!vals.length) return `${props.label} : pas encore de mesure`
  const seconds = Math.round(vals.length / 2)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const f = (v) => `${Math.round(v)}${props.unit}`
  return `${props.label} — ${seconds} dernières s : min ${f(Math.min(...vals))} · moy ${f(avg)} · max ${f(Math.max(...vals))}`
})
</script>
