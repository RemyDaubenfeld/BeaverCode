<template>
    <div class="px-6 m-auto">
        <ModelList @delete-model="handleDeleteModel" />

        <div class="flex justify-start mt-6">
          <button
            @click="showLibrary = true"
            class="flex items-center justify-center px-3 py-1.5 text-sm font-semibold rounded-bc cursor-pointer border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-orange text-bc-ink"
          >
            <MagnifyingGlassCircleIcon class="w-4 h-4 cursor-pointer mr-2"/>
            Bibliothèque Ollama
          </button>
          <button
            @click="showHuggingFace = true"
            title="Modèles GGUF de HuggingFace, et import d'un fichier GGUF local"
            class="flex items-center ml-5 justify-center px-3 py-1.5 text-sm font-semibold rounded-bc cursor-pointer border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-orange text-bc-ink"
          >
            <CloudArrowDownIcon class="w-4 h-4 cursor-pointer mr-2" />
            HuggingFace
          </button>

          <PullProgressList class="flex-1 ml-5 min-w-0" />
        </div>

        <LibrarySearchModal
          v-if="showLibrary"
          @close="showLibrary = false"
          @pull-success="onPullSuccess"
        />

        <HuggingFaceModal
          v-if="showHuggingFace"
          @close="showHuggingFace = false"
          @pull-success="onPullSuccess"
        />

        <p v-if="deleteError" class="mt-3 text-sm text-bc-danger">{{ deleteError }}</p>
    </div>
</template>

<script setup>
import LibrarySearchModal from '~/components/LibrarySearchModal.vue'
import HuggingFaceModal from '~/components/HuggingFaceModal.vue'

import { CloudArrowDownIcon, MagnifyingGlassCircleIcon } from '@heroicons/vue/24/solid'


const showLibrary = ref(false)
const showHuggingFace = ref(false)
const deleteError = ref('')
const { refresh } = useModels()

async function handleDeleteModel(modelName) {
  if (!confirm(`Supprimer le modèle "${modelName}" ?`)) return

  deleteError.value = ''
  try {
    await $fetch('/api/model', { method: 'DELETE', body: { name: modelName } })
    refresh()
  } catch (e) {
    deleteError.value = e.data?.statusMessage ?? 'Erreur lors de la suppression'
  }
}

function onPullSuccess() {
  refresh()
}
</script>