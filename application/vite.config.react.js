import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/react',
  build: {
    outDir: '../../public/react-dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: `assets/[name]-WORKING-[hash].js`,
        chunkFileNames: `assets/[name]-WORKING-[hash].js`,
        assetFileNames: `assets/[name]-WORKING-[hash].[ext]`
      }
    }
  },
  esbuild: false,
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/health': 'http://localhost:5000'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/react'),
      '@components': path.resolve(__dirname, 'src/react/components'),
      '@pages': path.resolve(__dirname, 'src/react/pages'),
      '@utils': path.resolve(__dirname, 'src/react/utils'),
      '@hooks': path.resolve(__dirname, 'src/react/hooks'),
      '@theme': path.resolve(__dirname, 'src/react/theme')
    }
  },
  define: {
    __DEV__: JSON.stringify(true)
  }
});