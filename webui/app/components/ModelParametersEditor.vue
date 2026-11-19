<template>
  <div class="space-y-4">
    <div v-if="presets.length" class="flex items-center gap-2">
      <select
        v-model="presetToLoad"
        @change="loadPreset"
        class="px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border text-xs text-bc-text-secondary focus:outline-none focus:border-bc-orange"
      >
        <option value="">Charger un preset…</option>
        <option v-for="p in presets" :key="p.filename" :value="p.filename">{{ presetLabel(p.filename) }}</option>
      </select>
      <span v-if="presetMessage" class="text-xs text-bc-text-secondary">{{ presetMessage }}</span>
    </div>

    <div class="space-y-1.5">
      <div
        v-for="(row, i) in rows"
        :key="row.id"
        class="flex items-center gap-2"
      >
        <input
          v-model="row.key"
          :readonly="!row.isNew"
          list="ollama-parameters"
          placeholder="paramètre"
          class="w-44 shrink-0 px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange read-only:text-bc-text-muted read-only:focus:border-bc-border"
        />
        <input
          v-model="row.value"
          :placeholder="hints[row.key] ?? 'valeur'"
          class="flex-1 min-w-0 px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
          :class="row.value !== row.original ? '!border-bc-orange' : ''"
        />
        <button
          v-if="canRemove(row)"
          @click="rows.splice(i, 1)"
          title="Retirer"
          class="shrink-0 text-bc-text-secondary hover:text-bc-danger"
        >
          <XMarkIcon class="w-4 h-4" />
        </button>
        <span
          v-else
          class="shrink-0 w-4"
          title="Ollama ne permet pas de supprimer un paramètre existant, seulement d'en changer la valeur"
        />
      </div>
      <datalist id="ollama-parameters">
        <option v-for="(hint, key) in hints" :key="key" :value="key">{{ hint }}</option>
      </datalist>
      <button
        @click="addRow"
        class="text-xs text-bc-orange-light hover:text-bc-orange"
      >
        + Ajouter un paramètre
      </button>
    </div>

    <label class="block text-xs uppercase tracking-wide text-bc-text-secondary">
      Prompt système
      <textarea
        v-model="systemPrompt"
        rows="4"
        placeholder="Aucun prompt système"
        class="mt-1 w-full px-2 py-1.5 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs normal-case tracking-normal text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
    </label>

    <p class="text-xs text-bc-text-secondary leading-relaxed">
      Le modèle est recréé avec les nouvelles valeurs, sous le même nom ou un nouveau (instantané : les poids ne sont pas copiés, ils sont partagés sur le disque).
      Ollama ne permet que de <strong class="text-bc-text-secondary">modifier ou ajouter</strong> des paramètres : un paramètre existant ne peut pas être supprimé, et un prompt système vidé est conservé.
    </p>

    <div class="flex items-center gap-2">
      <input
        v-model="presetName"
        placeholder="nom du preset (ex: coder)"
        class="flex-1 min-w-0 px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
      <button
        @click="savePreset"
        :disabled="savingPreset"
        title="Enregistre ces paramètres et ce prompt système dans ~/.ollama/modelfiles pour les appliquer à d'autres modèles (le modèle lui-même n'est pas modifié)"
        class="shrink-0 px-3 py-1 text-xs rounded-bc border-2 border-bc-border-strong bg-bc-surface text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
      >
        {{ presetExists ? 'Remplacer le preset' : 'Enregistrer comme preset' }}
      </button>
    </div>

    <div class="space-y-2 rounded-bc border border-bc-border p-3">
      <span class="block text-xs uppercase tracking-wide text-bc-text-secondary">Enregistrer le modèle</span>
      <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer">
        <input v-model="mode" type="radio" value="overwrite" class="accent-bc-orange" />
        Écraser <span class="font-mono text-bc-text-primary">{{ name }}</span>
      </label>
      <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer">
        <input v-model="mode" type="radio" value="copy" class="accent-bc-orange" />
        Comme nouveau modèle (l'original reste intact)
      </label>
      <label class="flex items-center gap-2 text-sm text-bc-text-secondary cursor-pointer">
        <input v-model="mode" type="radio" value="rename" class="accent-bc-orange" />
        Renommer (l'original est remplacé, sa note de benchmark suit le nouveau nom)
      </label>
      <input
        v-if="mode !== 'overwrite'"
        v-model="newName"
        placeholder="nom-du-modele:tag"
        class="w-full px-2 py-1 rounded-bc bg-bc-surface-alt border border-bc-border font-mono text-xs text-bc-text-primary placeholder-bc-text-muted focus:outline-none focus:border-bc-orange"
      />
    </div>

    <p v-if="validationError" class="text-sm text-bc-danger">{{ validationError }}</p>
    <p v-if="saveError" class="text-sm text-bc-danger">{{ saveError }}</p>

    <div class="flex justify-end gap-2">
      <button
        @click="emit('cancel')"
        :disabled="saving"
        class="px-3 py-1.5 text-xs rounded-bc border-2 border-bc-border-strong bg-bc-surface text-bc-text-secondary shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-surface-alt active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        @click="save"
        :disabled="saving || (mode === 'overwrite' && !dirty)"
        class="px-3 py-1.5 text-xs rounded-bc font-display font-semibold border-2 border-bc-border-strong bg-bc-orange text-bc-ink shadow-bc-hard-sm transition-transform duration-75 hover:bg-bc-orange-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-bc-border disabled:bg-bc-surface-alt disabled:text-bc-text-muted disabled:shadow-none disabled:cursor-not-allowed"
      >
        {{ saving ? status : 'Enregistrer' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { XMarkIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  name: { type: String, required: true },
  // [{ key, value }] tels que renvoyés par /api/model/show (valeurs texte, chaînes entre guillemets)
  parameters: { type: Array, default: () => [] },
  system: { type: String, default: '' },
})
const emit = defineEmits(['saved', 'cancel'])

// paramètres Ollama courants, proposés en autocomplétion avec leur rôle
const hints = {
  temperature: 'créativité : 0 = déterministe, 1 = varié (ex. 0.7)',
  top_k: 'ne garde que les K tokens les plus probables (ex. 40)',
  top_p: 'ne garde que les tokens couvrant P de probabilité (ex. 0.9)',
  min_p: 'écarte les tokens moins probables que P × le meilleur (ex. 0.05)',
  num_ctx: 'taille du contexte en tokens (ex. 8192) — augmente la VRAM',
  num_predict: 'nombre max de tokens générés (-1 = illimité)',
  repeat_penalty: 'pénalise les répétitions (ex. 1.1)',
  repeat_last_n: 'fenêtre de tokens vérifiée pour les répétitions (ex. 64)',
  presence_penalty: 'pénalise les tokens déjà apparus (ex. 0)',
  frequency_penalty: 'pénalise selon la fréquence d\'apparition (ex. 0)',
  seed: 'graine aléatoire fixe pour des réponses reproductibles',
  stop: 'séquence qui arrête la génération (une ligne par séquence)',
  num_gpu: 'nombre de couches placées sur le GPU (laisser Ollama décider de préférence)',
  num_thread: 'nombre de threads CPU',
  num_batch: 'taille des lots de traitement du prompt (ex. 512)',
}
// Ollama enregistre sans erreur un paramètre inconnu (vérifié avec `foo`) : on n'accepte pour les
// nouvelles lignes que les noms valides (options runtime d'Ollama), proposés ou non en autocomplétion
const VALID_KEYS = new Set([
  ...Object.keys(hints),
  'typical_p', 'num_keep', 'mirostat', 'mirostat_tau', 'mirostat_eta', 'penalize_newline',
  'main_gpu', 'use_mmap', 'num_gqa',
])

let nextId = 0
// les valeurs de /api/show sont du texte : `"<|im_end|>"` (entre guillemets) ou `0.6`
const unquote = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v)

const rows = ref(props.parameters.map((p) => {
  const value = unquote(p.value)
  return { id: nextId++, key: p.key, value, original: value, isNew: false }
}))
const systemPrompt = ref(props.system ?? '')

// 'overwrite' : écraser le modèle · 'copy' : enregistrer sous un nouveau nom · 'rename' : copier puis supprimer l'original
const mode = ref('overwrite')
// suggestion pour une copie : qwen3:8b → qwen3:8b-custom (le tag peut contenir des tirets)
const copySuggestion = props.name.includes(':') ? `${props.name}-custom` : `${props.name}-custom:latest`
const newName = ref(copySuggestion)
// pour un renommage, on part du nom actuel (on corrige souvent juste une partie) ; on ne touche pas à
// un nom déjà saisi par l'utilisateur
watch(mode, (m) => {
  if (m === 'rename' && newName.value === copySuggestion) newName.value = props.name
  if (m === 'copy' && newName.value === props.name) newName.value = copySuggestion
})
const { modelList } = useModels()

// Ollama ajoute ":latest" à un nom sans tag : on normalise pour comparer avec les modèles existants
const withTag = (n) => (n.includes(':') ? n : `${n}:latest`)

function validateNewName() {
  const n = newName.value.trim()
  if (!n) return 'Indique un nom pour le nouveau modèle.'
  // caractères acceptés par Ollama : lettres, chiffres, . _ - pour le nom, / pour un espace de noms, : pour le tag
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]*(:[a-zA-Z0-9][a-zA-Z0-9._\-]*)?$/.test(n)) {
    return 'Nom invalide : lettres, chiffres, « . », « _ », « - » et « / », puis éventuellement « :tag ».'
  }
  if ((modelList.value ?? []).some((m) => m.name === withTag(n))) {
    return `Un modèle « ${withTag(n)} » existe déjà.`
  }
  return ''
}

const saving = ref(false)
const status = ref('')
const validationError = ref('')
const saveError = ref('')

const dirty = computed(() =>
  systemPrompt.value !== (props.system ?? '')
  || rows.value.length !== props.parameters.length
  || rows.value.some((r) => r.isNew || r.value !== r.original)
)

// --- Presets : jeux de paramètres + prompt système réutilisables (fichiers .modelfile de
// ~/.ollama/modelfiles, sans ligne FROM) -------------------------------------------------------
const presets = ref([])
const presetToLoad = ref('')
const presetMessage = ref('')
const presetName = ref('')
const savingPreset = ref(false)

const presetLabel = (filename) => filename.replace(/\.modelfile$/i, '')
const presetExists = computed(() =>
  presets.value.some((p) => presetLabel(p.filename).toLowerCase() === presetName.value.trim().toLowerCase())
)

async function loadPresetList() {
  try {
    presets.value = (await $fetch('/api/modelfiles')).files ?? []
  } catch {
    presets.value = []
  }
}
onMounted(loadPresetList)

// Applique un preset au formulaire (rien n'est envoyé à Ollama avant « Enregistrer ») :
// - un paramètre déjà présent prend la valeur du preset, un paramètre absent est ajouté ;
// - les `stop` du preset remplacent tous les `stop` actuels (comme Ollama le fera à l'enregistrement) ;
// - les paramètres que le preset ne mentionne pas sont conservés (Ollama ne permet pas de les retirer) ;
// - le prompt système est remplacé si le preset en a un.
async function loadPreset() {
  const filename = presetToLoad.value
  if (!filename) return
  presetMessage.value = ''
  try {
    const { parameters, system } = await $fetch('/api/modelfiles/read', { query: { filename } })
    for (const [key, value] of Object.entries(parameters)) {
      if (key === 'stop') {
        rows.value = rows.value.filter((r) => r.key !== 'stop')
        for (const v of [value].flat()) {
          rows.value.push({ id: nextId++, key, value: String(v), original: null, isNew: true })
        }
        continue
      }
      const row = rows.value.find((r) => r.key === key)
      if (row) row.value = String(value)
      else rows.value.push({ id: nextId++, key, value: String(value), original: null, isNew: true })
    }
    if (system) systemPrompt.value = system
    presetName.value = presetLabel(filename)
    presetMessage.value = `Preset « ${presetLabel(filename)} » appliqué au formulaire.`
  } catch {
    presetMessage.value = 'Impossible de lire ce preset.'
  } finally {
    presetToLoad.value = ''
  }
}

async function savePreset() {
  validationError.value = ''
  presetMessage.value = ''
  const name = presetName.value.trim()
  if (!name) {
    validationError.value = 'Indique un nom pour le preset.'
    return
  }
  let parameters
  try {
    parameters = buildParameters()
  } catch (e) {
    validationError.value = e.message
    return
  }
  savingPreset.value = true
  try {
    const { filename } = await $fetch('/api/modelfiles/save', {
      method: 'POST',
      body: { filename: name, parameters, system: systemPrompt.value },
    })
    await loadPresetList()
    presetMessage.value = `Preset « ${presetLabel(filename)} » enregistré.`
  } catch {
    validationError.value = "Échec de l'enregistrement du preset."
  } finally {
    savingPreset.value = false
  }
}

// - une nouvelle ligne peut toujours être retirée
// - `stop` est envoyé comme une liste qui remplace l'ancienne : on peut en retirer tant qu'il en reste un
//   (s'il n'en restait aucun, la clé ne serait pas envoyée et Ollama garderait l'ancienne liste)
// - les autres paramètres existants ne peuvent pas être supprimés (Ollama fusionne, cf. updateModel())
function canRemove(row) {
  if (row.isNew) return true
  return row.key === 'stop' && rows.value.filter((r) => r.key === 'stop').length > 1
}

function addRow() {
  rows.value.push({ id: nextId++, key: '', value: '', original: null, isNew: true })
}

// texte du formulaire → valeur typée attendue par Ollama (nombre, booléen ou texte)
function typed(value) {
  const v = value.trim()
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v === 'true' || v === 'false') return v === 'true'
  return v
}

function buildParameters() {
  const params = {}
  for (const row of rows.value) {
    const key = row.key.trim()
    if (!key && !row.value.trim()) continue // ligne ajoutée puis laissée vide
    if (!key) throw new Error('Un paramètre n\'a pas de nom.')
    if (row.isNew && !VALID_KEYS.has(key)) throw new Error(`« ${key} » n'est pas un paramètre Ollama.`)
    if (!row.value.trim()) throw new Error(`Le paramètre « ${key} » n'a pas de valeur.`)
    if (key === 'stop') {
      params.stop = [...(params.stop ?? []), row.value] // pas de trim : un espace peut être voulu
    } else if (key in params) {
      throw new Error(`Le paramètre « ${key} » apparaît deux fois.`)
    } else {
      params[key] = typed(row.value)
    }
  }
  return params
}

async function save() {
  validationError.value = ''
  saveError.value = ''
  let parameters
  try {
    parameters = buildParameters()
  } catch (e) {
    validationError.value = e.message
    return
  }
  const target = mode.value === 'overwrite' ? props.name : withTag(newName.value.trim())
  if (mode.value !== 'overwrite') {
    validationError.value = validateNewName()
    if (validationError.value) return
  }

  saving.value = true
  status.value = 'Enregistrement…'
  try {
    const response = await fetch('/api/model/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: props.name,
        parameters,
        system: systemPrompt.value,
        target,
        rename: mode.value === 'rename',
      }),
    })
    if (!response.ok || !response.body) throw new Error('Échec de la modification')

    // progression NDJSON, comme pour la création de modèle
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const data = JSON.parse(line)
        if (data.error) throw new Error(data.error)
        // les statuts d'Ollama sont techniques ("using existing layer sha256:…") : libellé simplifié
        if (data.status?.startsWith('writing')) status.value = 'Écriture…'
        if (data.status?.startsWith('suppression')) status.value = 'Suppression de l\'original…'
      }
    }
    emit('saved', target, mode.value)
  } catch (e) {
    saveError.value = e.message ?? 'Erreur lors de la modification'
  } finally {
    saving.value = false
  }
}
</script>
