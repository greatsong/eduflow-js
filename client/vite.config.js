import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 7830,
    proxy: {
      '/api': {
        target: 'http://localhost:7829',
        changeOrigin: true,
      },
    },
  },
});
