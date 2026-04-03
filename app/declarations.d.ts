declare module 'vue3-emoji-picker/css' { }

declare module 'virtual:pwa-register/vue' {
  import type { Ref } from 'vue'

  export interface RegisterSWOptions {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: any) => void
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: Ref<boolean>
    offlineReady: Ref<boolean>
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}

declare module '#app' {
  interface NuxtApp {
    $isTauri: boolean
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $isTauri: boolean
  }
}

export { }