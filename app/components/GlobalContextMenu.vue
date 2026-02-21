<template>
  <UiContextMenu>
    <UiContextMenuTrigger class="block h-full w-full">
      <slot />
    </UiContextMenuTrigger>
    <UiContextMenuContent class="w-64">
      <UiContextMenuItem inset @click="reloadPage" class="cursor-pointer">
        Reload
      </UiContextMenuItem>
      <UiContextMenuItem inset @click="goBack" class="cursor-pointer">
        Back
      </UiContextMenuItem>
      <UiContextMenuItem inset @click="goForward" class="cursor-pointer">
        Forward
      </UiContextMenuItem>
      <UiContextMenuSeparator />
      <UiContextMenuItem inset @click="openAboutModal" class="cursor-pointer">
        About
      </UiContextMenuItem>
    </UiContextMenuContent>
  </UiContextMenu>
</template>

<script setup lang="ts">
const reloadPage = () => {
  window.location.reload();
}

const goBack = () => {
  window.history.back();
}

const goForward = () => {
  window.history.forward();
}

const openAboutModal = () => {
  
}
</script>
