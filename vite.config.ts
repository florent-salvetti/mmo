import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      core: '/src/core',
      shared: '/src/shared',
    },
  },
})
