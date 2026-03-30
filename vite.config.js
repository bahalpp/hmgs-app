import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'HMGS Çalışma ve Deneme Uygulaması',
        short_name: 'HMGS Hazırlık',
        description: 'Hukuk Mesleklerine Giriş Sınavı hazırlık uygulaması.',
        theme_color: '#f8fafc',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})
