<template>
    <div class="px-6 m-auto">
        <ModelList @delete-model="handleDeleteModel" />

        <div class="flex justify-start mt-6">
          <button
            @click="showLibrary = true"
            class="flex items-center justify-center px-3 py-1.5 text-sm font-semibold rounded-bc cursor-pointer border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-orange text-bc-ink"
          >
            <MagnifyingGlassCircleIcon class="w-4 h-4 cursor-pointer mr-2"/>
            Parcourir la bibliothèque
          </button>
          <button
            @click="addModel = true"
            class="flex items-center justify-center ml-5 px-3 py-1.5 text-sm font-semibold rounded-bc cursor-pointer border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-orange text-bc-ink"
          >
            <CloudArrowDownIcon class="w-4 h-4 cursor-pointer mr-2" />
            Importer un modèle
          </button>

          <button
            @click="createModel = true"
            class="flex items-center justify-center ml-5 px-3 py-1.5 text-sm font-semibold rounded-bc cursor-pointer border-2 border-bc-border-strong shadow-bc-hard-sm transition-transform duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none bg-bc-green text-bc-ink"
          >
           <PlusCircleIcon class="w-4 h-4 cursor-pointer mr-2" />
            Créer un modèle
          </button>
        </div>

        <LibrarySearchModal
          v-if="showLibrary"
          @close="showLibrary = false"
          @pull-success="onPullSuccess"
        />

        <ImportModelModal
          v-if="addModel"
          @close="addModel = false"
          @pull-success="onPullSuccess"
        />

        <CreateModelModal
          v-if="createModel"
          @close="createModel = false"
          @create-success="onPullSuccess"
        />

        <p v-if="deleteError" class="mt-3 text-sm text-bc-danger">{{ deleteError }}</p>
    </div>
</template>

<script setup>
import LibrarySearchModal from '~/components/LibrarySearchModal.vue'
import ImportModelModal from '~/components/ImportModelModal.vue'
import CreateModelModal from '~/components/CreateModelModal.vue'

import { CloudArrowDownIcon, MagnifyingGlassCircleIcon, PlusCircleIcon } from '@heroicons/vue/24/solid'


const showLibrary = ref(false)
const addModel = ref(false)
const createModel = ref(false)
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