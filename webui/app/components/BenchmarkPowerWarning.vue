<template>
  <!-- Avertissement avant un lancement : hors profil « performance » (ou sur batterie), les vitesses mesurées
       sont plus basses et ne se comparent pas à celles des autres runs. Rien d'affiché si tout va bien, ou si
       la machine n'expose pas de profil d'alimentation. -->
  <div
    v-if="message"
    class="flex items-start gap-2 rounded-bc border border-bc-warning/50 bg-bc-warning/10 px-3 py-2 text-xs text-bc-text-secondary"
    role="status"
  >
    <ExclamationTriangleIcon class="mt-0.5 h-4 w-4 shrink-0 text-bc-warning" />
    <p>
      <strong class="text-bc-warning">{{ message }}</strong>
      Les vitesses mesurées (tok/s, TTFT) seront plus basses qu'en mode performance sur secteur, et pas comparables
      à celles des autres runs (mesuré : 8,1 tok/s en <span class="font-mono">low-power</span> contre 10,5 en
      <span class="font-mono">performance</span>). Les notes, elles, ne changent pas. Le profil est enregistré
      avec chaque test.
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const power = ref(null) // { profile, choices, on_ac } — voir server/api/power.get.ts

async function load() {
  try {
    power.value = await $fetch('/api/power')
  } catch {
    power.value = null // information indisponible : pas d'avertissement plutôt qu'un faux
  }
}

// relu régulièrement : le profil se change à chaud (raccourci clavier, branchement du secteur)
let timer = null
onMounted(() => {
  load()
  timer = setInterval(load, 5000)
})
onBeforeUnmount(() => clearInterval(timer))

const message = computed(() => {
  const p = power.value
  if (!p) return ''
  const parts = []
  if (p.profile && p.profile !== 'performance') parts.push(`profil d'alimentation « ${p.profile} »`)
  if (p.on_ac === false) parts.push('sur batterie')
  if (!parts.length) return ''
  const text = parts.join(', ')
  return `PC ${p.profile && p.profile !== 'performance' ? 'en ' : ''}${text}.`
})
</script>
