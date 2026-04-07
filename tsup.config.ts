import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vue: 'src/vue.ts',
    nuxt: 'src/nuxt.ts',
    'api-axios': 'src/api-axios.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  treeshake: true,
  external: ['vue', 'axios'],
})
