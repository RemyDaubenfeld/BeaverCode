<template>
  <aside class="flex h-screen w-56 shrink-0 flex-col border-r-2 border-bc-border-strong bg-bc-surface p-4">
    <div class="mb-6 flex justify-center px-2 text-lg font-display font-semibold text-bc-text-primary">
      <img  src="assets/img/BeaverCode_logo.webp" alt="Logo BeaverCode">
    </div>

    <nav class="flex flex-col gap-1">
      <NuxtLink
        v-for="item in navigation"
        :key="item.href"
        :to="item.href"
        class="flex items-center gap-3 rounded-bc px-3 py-2 text-sm font-mono font-medium text-bc-text-secondary hover:bg-bc-surface-alt hover:text-bc-text-primary"
        active-class="bg-bc-surface-alt text-bc-orange-light border border-bc-orange"
      >
        <component :is="item.icon" class="size-5" aria-hidden="true" />
        {{ item.name }}
      </NuxtLink>
    </nav>
  </aside>
</template>

<script setup>
import { HomeIcon, ChartBarIcon, ChatBubbleLeftRightIcon, CircleStackIcon, ExclamationCircleIcon, WrenchScrewdriverIcon } from '@heroicons/vue/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Modèles', href: '/models', icon: CircleStackIcon },
  { name: 'Benchmark', href: '/benchmark', icon: ChartBarIcon },
  { name: 'Chat', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Paramètrage', href: '/', icon: WrenchScrewdriverIcon},
  { name: 'Logs', href: '/logs', icon: ExclamationCircleIcon }
]
</script>
