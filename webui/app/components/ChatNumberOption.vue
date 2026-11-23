<template>
  <!-- Réglage numérique du chat avec sa case « valeur du modèle » (null = réglage du modelfile) -->
  <div>
    <div class="mb-1 flex items-center justify-between gap-2">
      <!-- pointillés + curseur d'aide : signale qu'une infobulle détaillée est disponible au survol -->
      <label
        :for="`chat-${field.key}`"
        class="cursor-help text-xs text-bc-text-secondary underline decoration-bc-text-muted decoration-dotted underline-offset-2"
        :title="tooltip ?? field.help"
      >{{ field.label }}</label>
      <label class="flex cursor-pointer select-none items-center gap-1.5 text-xs text-bc-text-secondary">
        <input
          type="checkbox"
          class="accent-bc-orange"
          :disabled="disabled"
          :checked="options[field.key] === null"
          @change="options[field.key] = $event.target.checked ? null : field.fallback"
        />
        valeur du modèle
      </label>
    </div>
    <input
      :id="`chat-${field.key}`"
      v-model.number="options[field.key]"
      type="number"
      :min="field.min" :max="field.max" :step="field.step"
      :disabled="disabled || options[field.key] === null"
      :placeholder="placeholder ?? field.placeholder ?? 'valeur du modèle'"
      class="w-full rounded-bc border border-bc-border bg-bc-surface-alt px-2 py-1 font-mono text-xs text-bc-text-primary focus:border-bc-orange focus:outline-none disabled:cursor-not-allowed"
      :class="[
        // case « valeur du modèle » cochée : le texte indicatif donne la valeur réellement appliquée, il doit rester lisible
        options[field.key] === null ? 'placeholder:text-bc-text-secondary' : 'placeholder:text-bc-text-muted',
        // grisé seulement quand tout le panneau est verrouillé (génération en cours)
        disabled ? 'opacity-50' : '',
      ]"
    />
  </div>
</template>

<script setup>
// `options` est l'objet réactif des réglages de la conversation : modifié directement, comme dans ChatSettings
defineProps({
  field: { type: Object, required: true }, // { key, label, min, max, step, fallback, integer?, placeholder?, help }
  options: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: null },
  tooltip: { type: String, default: null }, // infobulle détaillée (plage, défaut, valeurs courantes), voir ChatSettings
})
</script>
