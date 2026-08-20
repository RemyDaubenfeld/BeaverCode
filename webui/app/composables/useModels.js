let interval = null

export function useModels() {
    const modelName = useState('models-name', () => null)
    const modelList = useState('models-list', () => null)

    async function refresh() {
    const [model] = await Promise.all([
      $fetch('/api/model'),
    ])
    modelName.value = model.loaded
    modelList.value = model.models
    }

    onMounted(() => {
    if (!interval) {
      refresh()
      interval = setInterval(refresh, 2000)
    }
  })

  return { modelName, modelList, refresh }
}