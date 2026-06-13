import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Allow devices on local network to connect
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
