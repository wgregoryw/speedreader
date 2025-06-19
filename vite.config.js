import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/speedreader/', // Replace with your repository name
  plugins: [react()],
});
