import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    chunkSizeWarningLimit: 650,
  },
});
