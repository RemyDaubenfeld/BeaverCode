<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')">
      <div class="w-full max-h-[85vh] overflow-y-auto rounded-bc border-2 border-bc-border-strong bg-bc-surface p-4 text-bc-text-primary shadow-bc-hard" :class="maxWidthClass">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wide text-bc-text-secondary">
            <slot name="header" />
          </h2>
          <div class="flex items-center gap-1 shrink-0">
            <slot name="actions" />
            <button @click="emit('close')" class="text-bc-text-secondary hover:text-bc-text-primary">
              <XMarkIcon class="w-5 h-5" />
            </button>
          </div>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { XMarkIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  size: { type: String, default: 'md' }, // 'md' | 'xl'
})
const emit = defineEmits(['close'])

const maxWidthClass = computed(() => (props.size === 'xl' ? 'max-w-6xl' : 'max-w-lg'))

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
