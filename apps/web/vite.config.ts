import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@articlio/api': path.resolve(__dirname, '../../packages/api/src/index.ts'),
      '@articlio/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@articlio/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
      '@articlio/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
});
