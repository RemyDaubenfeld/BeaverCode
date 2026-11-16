<template>
  <Modal size="lg" @close="emit('close')">
    <template #header>
      <span class="font-mono normal-case text-bc-text-primary">{{ name }}</span>
    </template>

    <p v-if="pending" class="text-sm text-bc-text-muted">Chargement…</p>
    <p v-else-if="error" class="text-sm text-bc-danger">Impossible de lire les informations du modèle.</p>

    <template v-else-if="info">
      <!-- onglets : on n'affiche que ceux qui ont du contenu -->
      <div class="flex flex-wrap gap-1 mb-4 border-b-2 border-bc-border-strong">
        <button
          v-for="t in tabs"
          :key="t.id"
          @click="tab = t.id"
          class="px-3 py-1.5 text-xs font-mono -mb-0.5 cursor-pointer rounded-t-bc border-2 border-b-0"
          :class="tab === t.id
            ? 'border-bc-border-strong bg-bc-bg text-bc-orange-light relative top-0.5'
            : 'border-transparent text-bc-text-muted hover:text-bc-text-secondary'"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Aperçu -->
      <div v-if="tab === 'overview'" class="space-y-4">
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <template v-for="row in overviewRows" :key="row.label">
            <dt class="text-bc-text-muted">{{ row.label }}</dt>
            <dd class="font-mono text-bc-text-primary">{{ row.value }}</dd>
          </template>
          <dt class="text-bc-text-muted">Capacités</dt>
          <dd class="flex flex-wrap gap-1">
            <span
              v-for="cap in info.capabilities"
              :key="cap"
              class="font-mono text-[11px] px-1.5 py-0.5 rounded border border-bc-border text-bc-text-secondary"
            >
              {{ cap }}
            </span>
          </dd>
        </dl>

        <div>
          <h3 class="text-xs uppercase tracking-wide text-bc-text-muted mb-2">Architecture</h3>
          <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <template v-for="row in architectureRows" :key="row.label">
              <dt class="text-bc-text-muted" :title="row.hint">{{ row.label }}</dt>
              <dd class="font-mono text-bc-text-primary">{{ row.value }}</dd>
            </template>
          </dl>
        </div>

      </div>

      <!-- Contexte -->
      <div v-else-if="tab === 'context'" class="space-y-3">
        <p class="text-xs text-bc-text-secondary leading-relaxed">
          Le contexte maximal du modèle est de <span class="font-mono text-bc-text-primary">{{ formatCtx(info.context.max) }}</span> tokens,
          mais Ollama n'alloue que <span class="font-mono text-bc-text-primary">num_ctx</span> tokens
          (<span class="font-mono text-bc-text-primary">{{ formatCtx(info.context.configured) }}</span> pour ce modèle).
          Chaque token gardé en contexte occupe de la mémoire (le KV cache) : plus le contexte est grand, plus le modèle déborde de la VRAM.
          <template v-if="info.context.sizes[0]?.kv_cache_type">
            KV cache au format <span class="font-mono text-bc-text-primary">{{ info.context.sizes[0].kv_cache_type }}</span>
            (<span class="font-mono">OLLAMA_KV_CACHE_TYPE</span>, voir Paramétrage)<template v-if="info.context.sizes[0].kv_cache_type !== 'f16'"> : compressé, {{ info.context.sizes[0].kv_cache_type === 'q4_0' ? 'environ 3,5' : 'environ 2' }} fois plus petit qu'en f16</template>.
          </template>
        </p>
        <div class="overflow-x-auto rounded-bc border border-bc-border">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-bc-text-muted border-b border-bc-border">
                <th class="py-1.5 px-3 font-medium">num_ctx</th>
                <th class="py-1.5 px-3 font-medium">KV cache</th>
                <th class="py-1.5 px-3 font-medium">Total</th>
                <th class="py-1.5 px-3 font-medium">Verdict</th>
                <th class="py-1.5 px-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in info.context.sizes"
                :key="s.num_ctx"
                class="border-b border-bc-border last:border-b-0"
                :class="s.num_ctx === info.context.configured ? 'bg-bc-surface-alt' : ''"
              >
                <td class="py-1.5 px-3 font-mono text-bc-text-primary">{{ formatCtx(s.num_ctx) }}</td>
                <td class="py-1.5 px-3 font-mono text-bc-text-secondary">{{ formatGo(s.kv_cache_bytes) }}</td>
                <td class="py-1.5 px-3 font-mono text-bc-text-secondary">{{ formatGo(s.total_bytes) }}</td>
                <td class="py-1.5 px-3 whitespace-nowrap">
                  <VramFitBadge :estimate="s" :show-size="false" />
                </td>
                <td class="py-1.5 px-3">
                  <div class="flex flex-wrap gap-1">
                    <span v-if="s.num_ctx === info.context.configured" :class="tagClass" class="!border-bc-orange !text-bc-orange">configuré</span>
                    <span v-if="s.num_ctx === BENCHMARK_NUM_CTX" :class="tagClass" title="Le benchmark impose num_ctx 8192 à tous les modèles">benchmark</span>
                    <span v-if="s.num_ctx === info.context.max" :class="tagClass">max</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="info.context.sizes[0]?.kv_cache_bytes == null" class="text-xs text-bc-warning">
          L'architecture de ce modèle n'expose pas les dimensions nécessaires au calcul du KV cache.
        </p>
      </div>

      <!-- Paramètres -->
      <ModelParametersEditor
        v-else-if="tab === 'parameters' && editing"
        :name="name"
        :parameters="info.parameters"
        :system="info.system ?? ''"
        @cancel="editing = false"
        @saved="onSaved"
      />
      <div v-else-if="tab === 'parameters'" class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-bc-text-muted">
            {{ info.parameters.length ? 'Valeurs définies dans le modelfile.' : 'Aucun paramètre : valeurs par défaut d\'Ollama.' }}
            <span v-if="savedMessage" class="text-bc-green">{{ savedMessage }}</span>
          </p>
          <button
            @click="editing = true; savedMessage = ''"
            class="shrink-0 px-3 py-1 text-xs rounded-bc border-2 border-bc-border-strong bg-bc-surface text-bc-orange-light shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Modifier
          </button>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <template v-for="(p, i) in info.parameters" :key="i">
            <dt class="font-mono text-bc-text-muted">{{ p.key }}</dt>
            <dd class="font-mono text-bc-text-primary break-all">{{ p.value }}</dd>
          </template>
        </dl>
        <div v-if="info.system">
          <h3 class="text-xs uppercase tracking-wide text-bc-text-muted mb-2">Prompt système</h3>
          <pre :class="preClass" class="whitespace-pre-wrap">{{ info.system }}</pre>
        </div>
      </div>

      <pre v-else-if="tab === 'template'" :class="preClass">{{ info.template }}</pre>
      <pre v-else-if="tab === 'modelfile'" :class="preClass">{{ info.modelfile }}</pre>
      <pre v-else-if="tab === 'license'" :class="preClass" class="whitespace-pre-wrap">{{ info.license }}</pre>
    </template>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const props = defineProps({
  name: { type: String, required: true },
  // ouverture directe sur un onglet avec un message (après « enregistrer comme nouveau modèle »)
  initialTab: { type: String, default: 'overview' },
  notice: { type: String, default: '' },
})
// open-model : demande au parent d'afficher la fiche d'un autre modèle (celui qu'on vient de créer)
const emit = defineEmits(['close', 'open-model'])

// cf. BENCHMARK_NUM_CTX dans benchmark_tool/lib/config.py
const BENCHMARK_NUM_CTX = 8192

const { data: info, pending, error, refresh } = useFetch('/api/model/show', { query: { name: props.name } })
const { refresh: refreshModels, modelList } = useModels()

// Ollama garde le nom du modèle d'origine même après sa suppression : le modèle n'en dépend pas
// (il a sa propre liste de blobs, les poids partagés ne sont effacés que quand plus aucun modèle ne
// les utilise — vérifié), on le signale juste pour que le nom ne soit pas trompeur.
// Un parent qui est un FICHIER n'est pas un modèle : affiché tel quel. Cas rencontrés : chemin d'un GGUF
// importé (« /root/.ollama/… »), ou fichier source des modèles officiels (qwen3.5 : « model.gguf »,
// gemma4:12b : « imatrix-…/model-q4_K_M.gguf »).
function parentLabel(parent) {
  if (!parent) return '—'
  if (parent.startsWith('/') || parent.toLowerCase().endsWith('.gguf') || !modelList.value) return parent
  const withTag = parent.includes(':') ? parent : `${parent}:latest`
  return modelList.value.some((m) => m.name === withTag) ? parent : `${parent} (supprimé)`
}

const tab = ref(props.initialTab)
const editing = ref(false)
const savedMessage = ref(props.notice)

// après modification : on recharge la liste (le digest change → estimation VRAM recalculée côté serveur) et
// - modèle écrasé : on recharge cette fiche (nouveaux paramètres, nouveau num_ctx → onglet Contexte)
// - nouveau modèle : on bascule sur sa fiche
async function onSaved(target, mode) {
  editing.value = false
  await refreshModels()
  if (target && target !== props.name) {
    emit('open-model', target, mode === 'rename' ? `${props.name} renommé en ${target}.` : `Modèle ${target} créé.`)
    return
  }
  await refresh()
  savedMessage.value = 'Modifications enregistrées.'
}

const tabs = computed(() => [
  { id: 'overview', label: 'Aperçu', show: true },
  { id: 'context', label: 'Contexte', show: true },
  { id: 'parameters', label: 'Paramètres', show: true },
  { id: 'template', label: 'Template', show: info.value?.template },
  { id: 'modelfile', label: 'Modelfile', show: info.value?.modelfile },
  { id: 'license', label: 'Licence', show: info.value?.license },
].filter((t) => t.show))

const preClass = 'font-mono text-xs text-bc-text-secondary bg-bc-bg border border-bc-border rounded-bc p-3 overflow-auto max-h-[55vh] whitespace-pre'
const tagClass = 'font-mono text-[10px] px-1 rounded border border-bc-border text-bc-text-muted'

const overviewRows = computed(() => {
  const i = info.value
  if (!i) return []
  const est = i.context.sizes.find((s) => s.num_ctx === i.context.configured)
  const rows = [
    { label: 'Famille', value: i.details.family ?? '—' },
    { label: 'Paramètres', value: i.details.parameter_size ?? '—' },
  ]
  if (est?.active_params && est.active_params < est.total_params) {
    rows.push({
      label: 'MoE',
      value: `${formatParams(est.active_params)} actifs · ${est.expert_used_count}/${est.expert_count} experts par token`,
    })
  }
  rows.push(
    { label: 'Quantification', value: i.details.quantization_level ?? '—' },
    { label: 'Format', value: i.details.format ?? '—' },
    { label: 'Taille sur disque', value: formatGo(i.size) },
    { label: 'Modèle parent', value: parentLabel(i.details.parent_model) },
    { label: 'Modifié le', value: i.modified_at ? new Date(i.modified_at).toLocaleString('fr-FR') : '—' },
  )
  return rows
})

// libellé + explication (au survol) des métadonnées d'architecture
const architectureLabels = {
  architecture: ['Architecture', 'Famille de réseau (llama.cpp)'],
  parameter_count: ['Nombre de paramètres', 'Nombre exact de poids du modèle'],
  block_count: ['Couches', 'Nombre de blocs transformer empilés'],
  embedding_length: ['Embedding', 'Taille du vecteur qui représente chaque token'],
  feed_forward_length: ['Feed-forward', 'Taille de la couche intermédiaire de chaque bloc'],
  'attention.head_count': ['Têtes d\'attention', 'Nombre de têtes de requête (Q)'],
  'attention.head_count_kv': ['Têtes KV', 'Têtes clé/valeur : moins elles sont nombreuses (GQA), plus le KV cache est petit'],
  'attention.key_length': ['Dimension des clés', 'Taille de chaque clé par tête'],
  'attention.value_length': ['Dimension des valeurs', 'Taille de chaque valeur par tête'],
  'attention.sliding_window': ['Sliding window', 'Certaines couches ne gardent que les N derniers tokens : KV cache bien plus petit'],
  expert_count: ['Experts', 'Nombre d\'experts par couche (MoE)'],
  expert_used_count: ['Experts actifs', 'Experts utilisés pour chaque token'],
  expert_feed_forward_length: ['Feed-forward expert', 'Taille de la couche intermédiaire de chaque expert'],
  'vision.block_count': ['Couches vision', 'Couches de l\'encodeur d\'images'],
}

const architectureRows = computed(() =>
  Object.entries(info.value?.architecture ?? {})
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({
      label: architectureLabels[key]?.[0] ?? key,
      hint: architectureLabels[key]?.[1],
      value: key === 'parameter_count' ? value.toLocaleString('fr-FR') : value,
    }))
)

function formatGo(bytes) {
  return bytes == null ? '—' : `${(bytes / 1024 ** 3).toFixed(2)} Go`
}

function formatParams(n) {
  return `${(n / 1e9).toFixed(1)}B`
}

function formatCtx(n) {
  if (n == null) return '—'
  return n >= 1024 && n % 1024 === 0 ? `${n / 1024}k` : n.toLocaleString('fr-FR')
}
</script>
