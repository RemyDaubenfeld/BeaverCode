<template>
  <aside class="flex h-screen w-56 shrink-0 flex-col border-r border-white/10 bg-gray-900 p-4">
    <div class="mb-6 flex justify-center px-2 text-lg font-semibold text-white">
      <img  src="assets/img/BeaverCode_logo.webp" alt="Logo BeaverCode">
    </div>

    <nav class="flex flex-col gap-1">
      <NuxtLink
        v-for="item in navigation"
        :key="item.href"
        :to="item.href"
        class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white"
        active-class="bg-gray-800 text-white"
      >
        <component :is="item.icon" class="size-5" aria-hidden="true" />
        {{ item.name }}
      </NuxtLink>
    </nav>
  </aside>
</template>

<script setup>
import { HomeIcon, ChartBarIcon, ChatBubbleLeftRightIcon, CircleStackIcon, ExclamationCircleIcon } from '@heroicons/vue/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Modèles', href: '/models', icon: CircleStackIcon },
  { name: 'Benchmark', href: '/benchmark', icon: ChartBarIcon },
  { name: 'Chat', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Logs', href: '/logs', icon: ExclamationCircleIcon }
]
</script>
