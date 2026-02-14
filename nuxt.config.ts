export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  srcDir: 'app',
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      },
      title: 'Matrix Client'
    }
  },

  runtimeConfig: {
    // Server-side config (not exposed to client)
    matrix: {
      baseUrl: process.env.NUXT_PUBLIC_MATRIX_BASE_URL || 'matrix.org',
      clientUrl: process.env.NUXT_PUBLIC_CLIENT_URL || 'https://localhost:3000',
    },
    public: {
      matrix: {
        baseUrl: process.env.NUXT_PUBLIC_MATRIX_BASE_URL || 'matrix.org',
      }
    }
  },

  routeRules: {
    '/chat/**': { ssr: false },
  },

  css: [
    '@/assets/css/main.css',
    '@/assets/css/tailwind.css',
  ],
  shadcn: {
    prefix: 'Ui',
    componentDir: '@/components/ui'
  },

  vite: {
    server: {
      allowedHosts: ['localho.st'],
    },
    optimizeDeps: {
      exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
    },
    esbuild: {
      supported: {
        'top-level-await': true
      },
    }
  },

  nitro: {
    experimental: {
      wasm: true,
    },
  },

  devServer: {
    host: '0.0.0.0',
    port: 3000,
    https: {
      key: '.dev/keys/server.key',
      cert: '.dev/keys/server.crt',
    },
  },

  modules: [
    '@nuxt/devtools',
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/icon',
    '@nuxt/fonts',
    '@nuxt/hints',
    '@nuxt/a11y',
    '@pinia/nuxt',
    'shadcn-nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/color-mode'
  ],

  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
  },
})