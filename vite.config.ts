import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'sample-content.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'EnglishLab 粤英学习舱',
        short_name: 'EnglishLab',
        description: '背稿 + 粤英夹杂词库，手机平板电脑都能用，离线可用',
        lang: 'zh-Hans',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#14181F',
        theme_color: '#14181F',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
