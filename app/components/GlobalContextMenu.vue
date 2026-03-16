<template>
  <UiContextMenu>
    <UiContextMenuTrigger class="block h-full w-full" @contextmenu.capture="handleGlobalContextMenu">
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
const handleGlobalContextMenu = (e: MouseEvent) => {
  // If the user right-clicked on an element that is itself a context menu trigger
  // (other than this global one), we should prevent the global one from opening.
  // We use capture mode to intercept the event before it bubbles down,
  // but we actually want to check the target.

  const target = e.target as HTMLElement;
  const trigger = target.closest('[data-slot="context-menu-trigger"]');

  // If we found a trigger and it's not the global trigger itself
  // Note: the global trigger has the class 'block h-full w-full'
  if (trigger && !trigger.classList.contains('w-full')) {
    // This is a heuristic. A better one might be checking if the trigger is nested.
    // Since this handler is on the global trigger, any 'trigger' found by 'closest'
    // that is NOT this global trigger must be a nested one.

    // However, e.currentTarget is the global trigger.
    if (trigger !== e.currentTarget) {
      e.stopPropagation();
    }
  }
}

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
