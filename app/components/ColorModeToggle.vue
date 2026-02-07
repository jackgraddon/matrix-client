<script setup lang="ts">
const colorMode = useColorMode()

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <UiButton variant="outline" size="icon" @click="toggleColorMode">
    <Icon 
      name="solar:sun-bold" 
      class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" 
    />
    <Icon 
      name="solar:moon-bold" 
      class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" 
    />
    <span class="sr-only">Toggle theme</span>
  </UiButton>
</template>
