/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Sem proxy: o front fala direto com o Supabase (VITE_SUPABASE_URL), ver src/lib/supabase.ts.

// PWA: só o SHELL (JS/CSS/HTML/ícones/fontes do build) fica em cache, para o app ser instalável e abrir rápido.
// REGRA DURA (LGPD + trilha append-only): NADA do Supabase no cache do service worker. Por isso: sem runtimeCaching
// (o SW só cacheia o build) e não há fila offline (outra fase, com decisão de arquitetura).
// `prompt`: a versão nova só entra quando a pessoa clica em "Atualizar" (nunca recarrega no meio de um cadastro).
// O manifest é o `public/site.webmanifest` (já referenciado no index.html), por isso `manifest: false`.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        globIgnores: ['og-image.png'],
        navigateFallback: 'index.html',
        
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
