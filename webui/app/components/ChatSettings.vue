<template>
  <aside class="flex flex-col gap-5 text-sm">
    <!-- Modèle -->
    <div>
      <label for="chat-model" class="font-display mb-1.5 block text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Modèle</label>
      <select
        id="chat-model"
        v-model="conversation.model"
        :disabled="disabled"
        class="w-full rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1.5 font-mono text-xs text-bc-text-primary focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option :value="null" disabled>Choisir un modèle…</option>
        <option v-for="m in chatModels" :key="m.name" :value="m.name">{{ m.name }}</option>
      </select>
      <p v-if="conversation.model && !modelInstalled" class="mt-1 text-xs text-bc-warning">
        Ce modèle n'est plus installé : choisis-en un autre pour continuer.
      </p>
      <div v-if="capabilities.length" class="mt-1.5 flex flex-wrap gap-1">
        <span
          v-for="cap in capabilities"
          :key="cap"
          class="rounded-md border border-bc-border bg-bc-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-bc-text-secondary"
        >{{ cap }}</span>
      </div>
    </div>

    <!-- Réflexion (modèles thinking uniquement) -->
    <div v-if="canThink">
      <label class="flex cursor-pointer select-none items-center justify-between gap-3">
        <span>
          <span class="font-display block text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Réflexion</span>
          <span class="text-xs text-bc-text-secondary">{{ conversation.think ? 'Le modèle réfléchit avant de répondre' : 'Réponse directe, sans réflexion' }}</span>
        </span>
        <input v-model="conversation.think" type="checkbox" :disabled="disabled" class="h-4 w-4 accent-bc-orange disabled:cursor-not-allowed" />
      </label>
    </div>

    <!-- Prompt système -->
    <div>
      <label for="chat-system" class="font-display mb-1.5 block text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">Prompt système</label>
      <textarea
        id="chat-system"
        v-model="conversation.system"
        :disabled="disabled"
        rows="5"
        placeholder="Vide : prompt système du modèle (modelfile)"
        class="w-full resize-y rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1.5 text-xs text-bc-text-primary placeholder:text-bc-text-muted focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>

    <!-- Génération : null = valeur du modèle -->
    <details class="group" :open="baseSet">
      <summary class="font-display flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">
        <ChevronRightIcon class="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        Génération
        <span v-if="baseCount" class="font-mono font-normal normal-case text-bc-orange-light">({{ baseCount }} fixé{{ baseCount > 1 ? 's' : '' }})</span>
      </summary>
      <div class="mt-2.5 space-y-2.5">
        <ChatNumberOption
          v-for="field in baseFields"
          :key="field.key"
          :field="field"
          :options="conversation.options"
          :disabled="disabled"
          :tooltip="tooltipFor(field)"
          :placeholder="placeholderFor(field)"
        />
      </div>
      <p class="mt-2 text-xs leading-relaxed text-bc-text-secondary">
        Changer le contexte recharge le modèle. Pour un modèle à réflexion, la réflexion compte dans « Tokens max ».
      </p>
    </details>

    <!-- Échantillonnage avancé : replié par défaut -->
    <details class="group" :open="advancedSet">
      <summary class="font-display flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">
        <ChevronRightIcon class="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        Échantillonnage
        <span v-if="advancedCount" class="font-mono font-normal normal-case text-bc-orange-light">({{ advancedCount }} fixé{{ advancedCount > 1 ? 's' : '' }})</span>
      </summary>
      <div class="mt-2.5 space-y-2.5">
        <ChatNumberOption
          v-for="field in samplingFields"
          :key="field.key"
          :field="field"
          :options="conversation.options"
          :disabled="disabled"
          :tooltip="tooltipFor(field)"
          :placeholder="placeholderFor(field)"
        />
        <!-- séquences d'arrêt : une par ligne -->
        <div>
          <div class="mb-1 flex items-center justify-between gap-2">
            <label for="chat-stop" class="cursor-help text-xs text-bc-text-secondary underline decoration-bc-text-muted decoration-dotted underline-offset-2" :title="stopTooltip">Séquences d'arrêt</label>
            <label class="flex cursor-pointer select-none items-center gap-1.5 text-xs text-bc-text-secondary">
              <input type="checkbox" class="accent-bc-orange" :disabled="disabled" :checked="conversation.options.stop === null" @change="toggleStop($event.target.checked)" />
              valeur du modèle
            </label>
          </div>
          <textarea
            id="chat-stop"
            v-model="stopText"
            rows="2"
            :disabled="disabled || conversation.options.stop === null"
            :placeholder="stopPlaceholder"
            @input="applyStop"
            class="w-full resize-y rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1 font-mono text-xs text-bc-text-primary focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed"
            :class="[conversation.options.stop === null ? 'placeholder:text-bc-text-secondary' : 'placeholder:text-bc-text-muted', disabled ? 'opacity-50' : '']"
          />
        </div>
        <p class="text-xs leading-relaxed text-bc-text-secondary">
          Une seed fixe rend les réponses reproductibles : même modèle, mêmes réglages, même question → même réponse.
        </p>
      </div>
    </details>

    <!-- Réponse : sortie structurée et maintien en mémoire -->
    <details class="group" :open="responseSet">
      <summary class="font-display flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-bc-text-secondary">
        <ChevronRightIcon class="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        Réponse
      </summary>
      <div class="mt-2.5 space-y-2.5">
        <div>
          <label for="chat-format" class="mb-1 block w-fit cursor-help text-xs text-bc-text-secondary underline decoration-bc-text-muted decoration-dotted underline-offset-2" :title="FORMAT_TOOLTIP">Sortie structurée</label>
          <select
            id="chat-format"
            :value="formatMode"
            :disabled="disabled"
            @change="setFormatMode($event.target.value)"
            class="w-full rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1 text-xs text-bc-text-primary focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="text">Texte libre</option>
            <option value="json">JSON</option>
            <option value="schema">JSON conforme à un schéma</option>
          </select>
          <textarea
            v-if="formatMode === 'schema'"
            v-model="schemaText"
            rows="6"
            :disabled="disabled"
            spellcheck="false"
            @input="applySchema"
            aria-label="Schéma JSON de la réponse"
            class="mt-1.5 w-full resize-y rounded-bc border bg-bc-surface-alt px-2 py-1 font-mono text-[11px] text-bc-text-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            :class="schemaError ? 'border-bc-danger' : 'border-bc-border focus:border-bc-orange'"
          />
          <p v-if="schemaError" class="mt-1 text-xs text-bc-danger">{{ schemaError }}</p>
          <p v-else-if="formatMode !== 'text'" class="mt-1 text-xs leading-relaxed text-bc-text-secondary">
            Pense à demander du JSON dans ton message : la contrainte garantit la forme, pas le contenu.
          </p>
        </div>
        <div>
          <label for="chat-keep-alive" class="mb-1 block w-fit cursor-help text-xs text-bc-text-secondary underline decoration-bc-text-muted decoration-dotted underline-offset-2" :title="KEEP_ALIVE_TOOLTIP">Garder chargé</label>
          <select
            id="chat-keep-alive"
            v-model="conversation.options.keep_alive"
            :disabled="disabled"
            class="w-full rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1 text-xs text-bc-text-primary focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option :value="null">Réglage du serveur (OLLAMA_KEEP_ALIVE)</option>
            <option value="5m">5 minutes</option>
            <option value="30m">30 minutes</option>
            <option value="1h">1 heure</option>
            <option value="-1">Toujours</option>
            <option value="0">Décharger après la réponse</option>
          </select>
        </div>
      </div>
    </details>

    <p v-if="optionsError" class="text-xs text-bc-danger">{{ optionsError }}</p>
  </aside>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'
// import explicite : composant ajouté pendant que le serveur de dev tournait, l'auto-import de Nuxt ne l'avait pas vu
import ChatNumberOption from './ChatNumberOption.vue'

const props = defineProps({
  conversation: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  modelContext: { type: Number, default: null }, // num_ctx appliqué en « valeur du modèle » (fiche du modèle)
  modelParameters: { type: Array, default: () => [] }, // paramètres du modelfile ([{ key, value }], fiche du modèle)
})

const { modelList } = useModels()

// modèles capables de converser (pas les modèles d'embedding seuls)
const chatModels = computed(() => (modelList.value ?? []).filter((m) => m.capabilities?.includes('completion')))
const current = computed(() => modelList.value?.find((m) => m.name === props.conversation.model) ?? null)
const modelInstalled = computed(() => !modelList.value || !!current.value)
const capabilities = computed(() => current.value?.capabilities ?? [])
const canThink = computed(() => capabilities.value.includes('thinking'))

// Définition des réglages numériques :
// - min / max : bornes acceptées (identiques à la validation serveur, chat.service.ts)
// - fallback : valeur proposée quand on décoche « valeur du modèle »
// - ollamaDefault : valeur appliquée par Ollama quand ni la conversation ni le modelfile ne la fixent
// - help / tips : infobulle (ce que fait le réglage, effet d'une valeur haute ou basse, valeurs courantes)
const baseFields = [
  {
    key: 'temperature', label: 'Température', min: 0, max: 2, step: 0.1, fallback: 0.7, ollamaDefault: '0.8',
    help: 'Dose de hasard dans le choix de chaque mot.',
    tips: ['Plus haute : réponses plus variées et créatives, mais plus d\'erreurs.', 'Plus basse : réponses plus prévisibles ; 0 = toujours le mot le plus probable.', 'Courant : 0 – 0.3 pour du code ou des faits, 0.7 – 1 pour de la rédaction.'],
  },
  {
    key: 'num_ctx', label: 'Contexte (num_ctx)', min: 512, max: 262144, step: 1024, fallback: 8192, integer: true, ollamaDefault: '4096',
    help: 'Mémoire de la conversation, en tokens : prompt système + historique + réponse doivent y tenir.',
    tips: ['Défaut d\'Ollama réglable sur le serveur avec OLLAMA_CONTEXT_LENGTH ; le modelfile peut fixer le sien.', 'Plus grand : conversations plus longues, mais plus de VRAM (le KV cache grossit avec lui) et un rechargement du modèle.', 'Au-delà, Ollama oublie silencieusement le début de la conversation (voir la jauge sous le fil).', 'Courant : 4096 – 16384 sur 4 Go de VRAM ; le maximum dépend du modèle.'],
  },
  {
    key: 'num_predict', label: 'Tokens max', min: 16, max: 32768, step: 256, fallback: 4096, integer: true, ollamaDefault: 'illimité',
    help: 'Longueur maximale d\'une réponse, réflexion comprise.',
    tips: ['Illimité : la réponse s\'arrête d\'elle-même, ou quand le contexte est plein.', 'Trop bas : réponse coupée (bouton « Continuer » pour la prolonger), ou vide si la réflexion a tout consommé.', 'Courant : 1024 – 4096 ; 8192 et plus pour un modèle à réflexion.'],
  },
]
const samplingFields = [
  {
    key: 'top_p', label: 'top_p', min: 0, max: 1, step: 0.05, fallback: 0.9, ollamaDefault: '0.9',
    help: 'Ne garde que les mots les plus probables dont les probabilités cumulées atteignent top_p (« nucleus sampling »).',
    tips: ['Plus bas : vocabulaire plus restreint, réponses plus sûres.', 'Plus haut : plus de diversité ; 1 = aucun filtre.', 'Courant : 0.8 – 0.95.'],
  },
  {
    key: 'top_k', label: 'top_k', min: 1, max: 1000, step: 1, fallback: 40, integer: true, ollamaDefault: '40',
    help: 'Ne garde que les k mots les plus probables à chaque étape.',
    tips: ['Plus bas : réponses plus conservatrices ; 1 = toujours le mot le plus probable.', 'Plus haut : plus de diversité.', 'Courant : 20 – 100.'],
  },
  {
    key: 'min_p', label: 'min_p', min: 0, max: 1, step: 0.01, fallback: 0.05, ollamaDefault: '0',
    help: 'Écarte les mots dont la probabilité est inférieure à min_p × celle du mot le plus probable.',
    tips: ['0 = désactivé.', 'S\'adapte à la confiance du modèle : filtre fort quand il est sûr de lui, faible quand il hésite.', 'Alternative à top_p / top_k, utile surtout à température élevée.', 'Courant : 0.02 – 0.1.'],
  },
  {
    key: 'repeat_penalty', label: 'repeat_penalty', min: 0, max: 5, step: 0.05, fallback: 1.1, ollamaDefault: '1.1',
    help: 'Pénalise les mots déjà employés récemment (les 64 derniers tokens par défaut).',
    tips: ['1 = aucune pénalité ; au-dessus de 1 : moins de répétitions ; en dessous : les favorise.', 'Trop haut (> 1.3) : le modèle évite des mots nécessaires et le texte se dégrade.', 'Courant : 1.0 – 1.2. Utile contre un modèle qui boucle.'],
  },
  {
    key: 'seed', label: 'Seed', min: 0, max: 2147483647, step: 1, fallback: 42, integer: true, ollamaDefault: 'aléatoire',
    help: 'Graine du tirage aléatoire.',
    tips: ['Aléatoire : un nouveau tirage à chaque requête, donc des réponses différentes.', 'Fixe : même modèle + mêmes réglages + même question = même réponse, même à température élevée.', 'Utile pour comparer l\'effet d\'un seul réglage, ou deux modèles dans les mêmes conditions.', 'N\'importe quel entier convient : seule compte la répétition de la même valeur.'],
  },
]

const fmtNum = (n) => n.toLocaleString('fr-FR')

// paramètres du modelfile du modèle choisi ; « stop » peut apparaître plusieurs fois
const modelParams = computed(() => {
  const out = {}
  for (const { key, value } of props.modelParameters ?? []) {
    if (key === 'stop') (out.stop ??= []).push(value)
    else out[key] = value
  }
  return out
})

// valeur appliquée quand la case « valeur du modèle » est cochée : modelfile, sinon défaut d'Ollama
function appliedValue(field) {
  if (field.key === 'num_ctx' && props.modelContext) return { value: fmtNum(props.modelContext), source: 'modèle' }
  if (modelParams.value[field.key] != null) return { value: modelParams.value[field.key], source: 'modèle' }
  return { value: field.ollamaDefault, source: 'Ollama' }
}

function placeholderFor(field) {
  const { value, source } = appliedValue(field)
  return source === 'modèle' ? `valeur du modèle : ${value}` : `défaut d'Ollama : ${value}`
}

function tooltipFor(field) {
  const { value, source } = appliedValue(field)
  return [
    field.help,
    '',
    `Plage : ${fmtNum(field.min)} – ${fmtNum(field.max)}${field.integer ? ' (entier)' : ''}`,
    `Défaut d'Ollama : ${field.ollamaDefault}`,
    source === 'modèle' ? `Ce modèle (modelfile) : ${value}` : 'Ce modèle : pas de valeur dans son modelfile',
    '',
    ...field.tips,
  ].join('\n')
}

const modelStops = computed(() => modelParams.value.stop ?? [])
const stopPlaceholder = computed(() =>
  props.conversation.options.stop === null
    ? (modelStops.value.length ? `valeur du modèle : ${modelStops.value.join(', ')}` : 'valeur du modèle : aucune')
    : 'une séquence par ligne'
)
const stopTooltip = computed(() => [
  'La génération s\'arrête dès que l\'une de ces séquences apparaît dans la réponse (la séquence n\'est pas affichée).',
  '',
  'Plage : 1 à 8 séquences, de 100 caractères max, une par ligne',
  'Défaut d\'Ollama : aucune (le template du modèle définit déjà ses balises de fin)',
  modelStops.value.length ? `Ce modèle (modelfile) : ${modelStops.value.join(', ')}` : 'Ce modèle : pas de séquence dans son modelfile',
  '',
  'Exemples : « ``` » pour s\'arrêter après un bloc de code, « 6. » pour couper une liste au 5e point.',
].join('\n'))

const FORMAT_TOOLTIP = [
  'Contraint la forme de la réponse.',
  '',
  'JSON : la réponse est un JSON valide, de forme libre.',
  'Schéma : la réponse respecte un schéma JSON (propriétés, types, champs obligatoires).',
  '',
  'La contrainte garantit la forme, pas le contenu : demande quand même du JSON dans ton message.',
].join('\n')

const KEEP_ALIVE_TOOLTIP = [
  'Durée pendant laquelle le modèle reste chargé en mémoire après la réponse.',
  '',
  'Réglage du serveur : OLLAMA_KEEP_ALIVE (valeur visible dans Paramétrage → Ollama).',
  'Toujours : le modèle n\'est jamais déchargé automatiquement (il occupe la VRAM).',
  'Décharger après la réponse : libère la VRAM tout de suite, mais le prochain message rechargera le modèle.',
].join('\n')

const baseCount = computed(() => baseFields.filter((f) => props.conversation.options[f.key] !== null).length)
const baseSet = computed(() => baseCount.value > 0)
const advancedCount = computed(() =>
  samplingFields.filter((f) => props.conversation.options[f.key] !== null).length + (props.conversation.options.stop !== null ? 1 : 0)
)
// sections dépliées d'office quand elles contiennent un réglage actif (sinon on ne verrait pas qu'il s'applique)
const advancedSet = computed(() => advancedCount.value > 0)
const responseSet = computed(() => props.conversation.options.format !== null || props.conversation.options.keep_alive !== null)

// --- Séquences d'arrêt : texte (une par ligne) ↔ tableau
const stopText = ref('')
function applyStop() {
  const list = stopText.value.split('\n').filter((s) => s.length > 0)
  props.conversation.options.stop = list
}
function toggleStop(useModel) {
  props.conversation.options.stop = useModel ? null : []
  if (!useModel) stopText.value = ''
}

// --- Sortie structurée : null (texte libre) | 'json' | schéma (objet)
const formatMode = computed(() => {
  const f = props.conversation.options.format
  return f === null ? (schemaDraftActive.value ? 'schema' : 'text') : f === 'json' ? 'json' : 'schema'
})
const schemaDraftActive = ref(false) // mode schéma choisi mais schéma pas encore valide
const schemaText = ref('')
const schemaError = ref('')
const EXAMPLE_SCHEMA = { type: 'object', properties: { nom: { type: 'string' }, age: { type: 'integer' } }, required: ['nom', 'age'] }

function setFormatMode(mode) {
  schemaError.value = ''
  schemaDraftActive.value = mode === 'schema'
  if (mode === 'text') props.conversation.options.format = null
  else if (mode === 'json') props.conversation.options.format = 'json'
  else {
    if (!schemaText.value.trim()) schemaText.value = JSON.stringify(EXAMPLE_SCHEMA, null, 2)
    applySchema()
  }
}
function applySchema() {
  try {
    const parsed = JSON.parse(schemaText.value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Le schéma doit être un objet JSON')
    props.conversation.options.format = parsed
    schemaError.value = ''
  } catch (e) {
    // schéma invalide : pas envoyé (le précédent valide non plus), l'envoi est bloqué par optionsError
    props.conversation.options.format = null
    schemaError.value = e instanceof SyntaxError ? 'JSON invalide' : e.message
  }
}

// à l'ouverture d'une autre conversation : textes locaux recalculés depuis ses réglages
watch(() => props.conversation.id, () => {
  const o = props.conversation.options
  stopText.value = (o.stop ?? []).join('\n')
  schemaDraftActive.value = false
  schemaError.value = ''
  schemaText.value = o.format && o.format !== 'json' ? JSON.stringify(o.format, null, 2) : ''
}, { immediate: true })

// mêmes bornes que la validation serveur (chat.service.ts)
const optionsError = computed(() => {
  for (const f of [...baseFields, ...samplingFields]) {
    const v = props.conversation.options[f.key]
    if (v === null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max || (f.integer && !Number.isInteger(v))) {
      return `${f.label} : entre ${f.min} et ${f.max}${f.integer ? ' (nombre entier)' : ''}.`
    }
  }
  const stop = props.conversation.options.stop
  if (stop !== null && (!stop.length || stop.length > 8 || stop.some((s) => s.length > 100))) {
    return 'Séquences d\'arrêt : de 1 à 8, de 100 caractères max (ou « valeur du modèle »).'
  }
  if (schemaError.value) return `Schéma JSON : ${schemaError.value}.`
  return ''
})

defineExpose({ optionsError, canThink })
</script>
