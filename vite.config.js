import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Use relative asset paths so the app loads correctly when opened from file:// or inside an asar
  base: './',
  plugins: [react()],
})
