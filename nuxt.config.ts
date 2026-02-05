import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      }
    }
  },

  css: [
    '~/assets/css/main.css',
    '~/assets/css/tailwind.css'
  ],

  shadcn: {
    prefix: 'Shad',
    componentDir: '@/components/shad'
  },

  runtimeConfig: {
    public: {
      matrix: {
        baseUrl: process.env.NUXT_PUBLIC_MATRIX_BASE_URL || 'https://matrix.org',
      }
    }
  },

  vite: {
    server: {
      allowedHosts: ['localho.st'],
    },
    plugins: [
      tailwindcss(),
    ],
  },

  devServer: {
    host: '0.0.0.0',
    port: 3000,
    https: {
      key: 'server.key',
      cert: 'server.crt',
    },
  },

  modules: [
    '@nuxt/a11y',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/hints',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/scripts',
    'shadcn-nuxt',
    '@pinia/nuxt'
  ]
})