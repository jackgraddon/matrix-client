<template>
  <ContextMenu>
    <ContextMenuTrigger class="block h-full w-full">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-64">
      <ContextMenuItem inset @click="reloadPage">
        Reload
        <ContextMenuShortcut>⌘R</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem inset disabled>
        Back
        <ContextMenuShortcut>⌘[</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem inset disabled>
        Forward
        <ContextMenuShortcut>⌘]</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem inset disabled>
        Show DevTools
        <ContextMenuShortcut>⌥⌘I</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLabel inset>Matrix Client v0.0.1</ContextMenuLabel>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const reloadPage = () => {
  window.location.reload();
}
</script>
