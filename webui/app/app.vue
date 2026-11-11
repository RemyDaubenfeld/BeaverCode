<template>
  <div class="flex h-screen overflow-hidden">
    <Sidebar />
    <main class="flex-1 flex flex-col overflow-hidden">
      <Monitoring class="mb-6 shrink-0" />
      <div class="flex-1 overflow-y-auto">
        <NuxtPage />
      </div>
    </main>
  </div>
</template>
