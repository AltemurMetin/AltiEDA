import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/AltiEDA/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'component-editor.html',
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
