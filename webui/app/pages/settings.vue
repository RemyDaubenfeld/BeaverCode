<template>
  <div class="px-6 py-4 max-w-5xl">
    <h1 class="font-display text-lg font-semibold text-bc-text-primary mb-4">Paramétrage</h1>

    <!-- WebUI : réglages modifiables, enregistrés dans webui/.data/settings.json -->
    <section class="mb-8">
      <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-secondary mb-3">WebUI</h2>

      <p v-if="!form" class="text-sm text-bc-text-secondary">Chargement des réglages…</p>
      <!-- novalidate : la validation native des champs numériques n'accepte que min + n × step (avec min=512 et
           step=1024, 8192 était refusé) ; c'est le serveur qui valide (PUT /api/settings), avec un message clair -->
      <form v-else class="space-y-5" novalidate @submit.prevent="save">
        <!-- URL d'Ollama -->
        <div>
          <label for="set-ollama-url" class="block text-sm text-bc-text-secondary mb-1">URL du serveur Ollama</label>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id="set-ollama-url"
              v-model.trim="form.ollama_url"
              type="url"
              :placeholder="defaults.ollama_url"
              class="w-80 max-w-full px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-sm text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
            />
            <button
              type="button"
              @click="testUrl"
              :disabled="testing"
              class="px-3 py-1 text-xs rounded-bc border-2 border-bc-border-strong bg-bc-surface text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              {{ testing ? 'Test…' : 'Tester la connexion' }}
            </button>
            <span v-if="testResult" class="text-xs" :class="testResult.ok ? 'text-bc-green' : 'text-bc-danger'">
              {{ testResult.ok ? `✓ Ollama ${testResult.version}` : testResult.message }}
            </span>
          </div>
          <p class="mt-1 text-xs text-bc-text-secondary">
            Vide = {{ defaults.ollama_url }}. Utilisée par toute la WebUI (modèles, monitoring, logs) et par le benchmark.
          </p>
        </div>

        <!-- Juge par défaut -->
        <div>
          <label for="set-judge" class="block text-sm text-bc-text-secondary mb-1">Juge par défaut du benchmark</label>
          <select
            id="set-judge"
            v-model="form.default_judge"
            class="w-80 max-w-full px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-sm text-bc-text-primary focus:outline-none focus:border-bc-orange"
          >
            <option value="">Par défaut ({{ defaults.default_judge ?? 'lib/config.py' }})</option>
            <option v-for="m in modelList ?? []" :key="m.name" :value="m.name">{{ m.name }}</option>
          </select>
          <p class="mt-1 text-xs text-bc-text-secondary">
            Présélectionné au lancement d'un benchmark. Un juge texte seul : un modèle multimodal plante quand le juge est forcé sur CPU.
          </p>
        </div>

        <!-- Réglages de génération par défaut du benchmark -->
        <div>
          <label class="flex items-center gap-1.5 text-sm text-bc-text-secondary cursor-pointer select-none mb-1">
            <input v-model="customOptions" type="checkbox" class="accent-bc-orange" />
            Réglages de génération par défaut du benchmark personnalisés
          </label>
          <p v-if="!customOptions" class="text-xs text-bc-text-secondary">
            Valeurs de lib/config.py : <span class="font-mono">{{ formatRunOptions(defaults.benchmark_options) }}</span>.
          </p>
          <div v-else class="flex flex-wrap items-end gap-x-8 gap-y-3 mt-2">
            <div>
              <label class="block text-xs text-bc-text-secondary mb-1" for="set-temperature">Température</label>
              <div class="flex items-center gap-2">
                <input id="set-temperature" v-model.number="form.benchmark_options.temperature" type="number" min="0" max="2" step="0.1"
                  :disabled="modelValue.temperature"
                  class="w-20 px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary disabled:opacity-40" />
                <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
                  <input v-model="modelValue.temperature" type="checkbox" class="accent-bc-orange" /> valeur du modèle
                </label>
              </div>
            </div>
            <div>
              <label class="block text-xs text-bc-text-secondary mb-1" for="set-num-ctx">Contexte (num_ctx)</label>
              <div class="flex items-center gap-2">
                <input id="set-num-ctx" v-model.number="form.benchmark_options.num_ctx" type="number" min="1024" max="262144" step="1024"
                  :disabled="modelValue.num_ctx"
                  class="w-24 px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary disabled:opacity-40" />
                <label class="flex items-center gap-1.5 text-xs text-bc-text-secondary cursor-pointer select-none">
                  <input v-model="modelValue.num_ctx" type="checkbox" class="accent-bc-orange" /> valeur du modèle
                </label>
              </div>
            </div>
            <div>
              <label class="block text-xs text-bc-text-secondary mb-1" for="set-num-predict">Tokens max par réponse</label>
              <input id="set-num-predict" v-model.number="form.benchmark_options.num_predict" type="number" min="128" max="32768" step="128"
                class="w-24 px-2 py-1 text-sm rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-bc-text-primary" />
            </div>
          </div>
          <p v-if="customOptions" class="mt-1 text-xs text-bc-text-secondary">
            Préremplissent la section « Réglages de génération » du benchmark. Astuce : 4096 tokens max évite de couper les modèles à raisonnement pendant leur réflexion.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="submit"
            :disabled="saving"
            class="px-4 py-1.5 text-sm rounded-bc font-display font-semibold border-2 border-bc-border-strong bg-bc-orange text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
          <span v-if="saveMessage" class="text-xs" :class="saveError ? 'text-bc-danger' : 'text-bc-green'">{{ saveMessage }}</span>
        </div>
      </form>
    </section>

    <!-- Ollama : configuration du serveur, en lecture seule -->
    <section class="mb-8">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-secondary">Ollama</h2>
        <span v-if="config" class="text-xs text-bc-text-secondary">
          lecture seule — {{ sourceLabel }}
        </span>
      </div>

      <p v-if="pending" class="text-sm text-bc-text-secondary">Lecture de la configuration…</p>
      <p v-else-if="error" class="text-sm text-bc-danger">Impossible de lire la configuration d'Ollama.</p>

      <template v-else-if="config">
        <!-- ce que la configuration change pour la WebUI -->
        <div class="mb-3 grid gap-2 sm:grid-cols-3 text-xs">
          <div class="rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-2">
            <div class="text-bc-text-secondary">KV cache</div>
            <div class="font-mono text-sm text-bc-text-primary">{{ config.kv_cache_type }}</div>
            <div class="text-bc-text-secondary">{{ kvSummary }}</div>
          </div>
          <div class="rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-2">
            <div class="text-bc-text-secondary">Contexte par défaut</div>
            <div class="font-mono text-sm text-bc-text-primary">{{ config.default_num_ctx }} tokens</div>
            <div class="text-bc-text-secondary">pour les modèles sans num_ctx dans leur modelfile</div>
          </div>
          <div class="rounded-bc border border-bc-border bg-bc-surface-alt px-3 py-2">
            <div class="text-bc-text-secondary">Déchargement auto</div>
            <div class="font-mono text-sm text-bc-text-primary">{{ value('OLLAMA_KEEP_ALIVE') ?? '5m' }}</div>
            <div class="text-bc-text-secondary">après la dernière utilisation d'un modèle</div>
          </div>
        </div>
        <p class="mb-3 text-xs text-bc-text-secondary">
          Le format du KV cache et le contexte par défaut sont pris en compte dans l'estimation mémoire des modèles (colonne VRAM, fiche d'un modèle → Contexte).
        </p>

        <p
          v-if="config.unknown.length"
          class="mb-3 rounded-bc border border-bc-warning-dark bg-bc-warning-tint px-3 py-2 text-xs text-bc-warning"
        >
          Variable{{ config.unknown.length > 1 ? 's' : '' }} définie{{ config.unknown.length > 1 ? 's' : '' }} mais inconnue{{ config.unknown.length > 1 ? 's' : '' }} d'Ollama, donc sans effet :
          <span class="font-mono">{{ config.unknown.join(', ') }}</span>.
          <template v-if="config.unknown.includes('OLLAMA_NUM_GPU')">
            Pour forcer les couches sur le GPU, c'est le paramètre <span class="font-mono">num_gpu</span> d'un modèle (fiche du modèle → Paramètres).
          </template>
        </p>

        <div class="overflow-x-auto rounded-bc border border-bc-border">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-bc-text-secondary border-b border-bc-border">
                <th class="py-1.5 px-3 font-medium">Variable</th>
                <th class="py-1.5 px-3 font-medium">Valeur</th>
                <th class="py-1.5 px-3 font-medium">Rôle</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in config.variables" :key="v.name" class="border-b border-bc-border last:border-b-0 align-top">
                <td class="py-1.5 px-3 font-mono text-xs text-bc-text-secondary whitespace-nowrap">{{ v.name }}</td>
                <td class="py-1.5 px-3 font-mono text-xs whitespace-nowrap">
                  <span v-if="v.value != null" class="text-bc-text-primary">{{ v.value }}</span>
                  <span v-else class="text-bc-text-secondary" title="Non définie : valeur par défaut d'Ollama">{{ v.default }} <span class="italic">(défaut)</span></span>
                </td>
                <td class="py-1.5 px-3 text-xs text-bc-text-secondary">{{ v.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-2 text-xs text-bc-text-secondary">
          Pour les modifier : {{ howToChange }}, puis redémarrer Ollama.
        </p>
      </template>
    </section>
  </div>
</template>

<script setup>
const { data: config, pending, error, refresh: refreshConfig } = useFetch('/api/ollama-config')
const { modelList, refresh: refreshModels } = useModels()
const { refresh: refreshStatus } = useOllamaStatus()
const { formatRunOptions } = useBenchmarkFormat()

// --- Réglages de la WebUI ---------------------------------------------------------------------
const form = ref(null) // { ollama_url, default_judge, benchmark_options: { temperature, num_ctx, num_predict } }
const defaults = ref({})
const customOptions = ref(false) // décoché = benchmark_options null (défauts de lib/config.py)
const modelValue = reactive({ temperature: false, num_ctx: false }) // « valeur du modèle » → null

async function loadSettings() {
  const { settings, defaults: d } = await $fetch('/api/settings')
  defaults.value = d
  const opts = settings.benchmark_options ?? d.benchmark_options ?? { temperature: 0.2, num_ctx: 8192, num_predict: 1024 }
  form.value = {
    ollama_url: settings.ollama_url ?? '',
    default_judge: settings.default_judge ?? '',
    benchmark_options: { temperature: opts.temperature ?? 0.2, num_ctx: opts.num_ctx ?? 8192, num_predict: opts.num_predict },
  }
  customOptions.value = !!settings.benchmark_options
  modelValue.temperature = opts.temperature == null
  modelValue.num_ctx = opts.num_ctx == null
}
onMounted(loadSettings)

const testing = ref(false)
const testResult = ref(null)
async function testUrl() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await $fetch('/api/settings/test-ollama', { method: 'POST', body: { url: form.value.ollama_url || defaults.value.ollama_url } })
  } catch (e) {
    testResult.value = { ok: false, message: e?.data?.statusMessage ?? 'URL invalide' }
  } finally {
    testing.value = false
  }
}

const saving = ref(false)
const saveMessage = ref('')
const saveError = ref(false)
async function save() {
  saving.value = true
  saveMessage.value = ''
  saveError.value = false
  const o = form.value.benchmark_options
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: {
        ollama_url: form.value.ollama_url || null,
        default_judge: form.value.default_judge || null,
        benchmark_options: customOptions.value
          ? { temperature: modelValue.temperature ? null : o.temperature, num_ctx: modelValue.num_ctx ? null : o.num_ctx, num_predict: o.num_predict }
          : null,
      },
    })
    saveMessage.value = 'Réglages enregistrés.'
    // l'URL d'Ollama a pu changer : tout ce qui interroge Ollama est rafraîchi (allSettled : si la nouvelle
    // URL ne répond pas, les réglages sont quand même enregistrés — la barre latérale affichera « hors ligne »)
    await Promise.allSettled([refreshModels(), refreshStatus(), refreshConfig()])
  } catch (e) {
    saveError.value = true
    saveMessage.value = e?.data?.statusMessage ?? 'Échec de l\'enregistrement.'
  } finally {
    saving.value = false
  }
}

const value = (name) => config.value?.variables.find((v) => v.name === name)?.value ?? null

const sourceLabel = computed(() => ({
  docker: 'lue dans le conteneur Docker d\'Ollama',
  systemd: 'lue dans le service systemd « ollama »',
  defaults: 'configuration introuvable (ni conteneur Docker, ni service systemd) : valeurs par défaut d\'Ollama supposées',
}[config.value?.source]))

const howToChange = computed(() => ({
  docker: 'variables d\'environnement du conteneur (section environment du docker-compose, ou docker run -e)',
  systemd: 'sudo systemctl edit ollama (lignes Environment="…")',
  defaults: 'variables d\'environnement du processus Ollama',
}[config.value?.source]))

const kvSummary = computed(() => ({
  f16: '2 octets par valeur (non compressé)',
  q8_0: '≈ 1,06 octet par valeur : moitié moins de mémoire qu\'en f16',
  q4_0: '≈ 0,56 octet par valeur : 3,5 fois moins qu\'en f16',
}[config.value?.kv_cache_type]))
</script>
