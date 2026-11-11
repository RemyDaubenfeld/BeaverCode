let interval = null

export function useModels() {
    const modelName = useState('models-name', () => null)
    const modelList = useState('models-list', () => null)
    const loadedModels = useState('models-loaded', () => [])

    async function refresh() {
    const [model, loaded] = await Promise.all([
      $fetch('/api/model'),
      $fetch('/api/model/loaded'),
    ])
    modelName.value = model.loaded
    modelList.value = model.models
    loadedModels.value = loaded.models ?? []
    }

    onMounted(() => {
    if (!interval) {
      refresh()
      interval = setInterval(refresh, 2000)
    }
  })

  return { modelName, modelList, loadedModels, refresh }
}