import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["cardsmith-icon.svg", "icons/cardsmith-192.png", "icons/cardsmith-512.png"],
      manifest: {
        id: "./",
        name: "Cardsmith",
        short_name: "Cardsmith",
        description: "Local-first character-card compatibility and formatting editor.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0b0e13",
        theme_color: "#10141b",
        icons: [
          {
            src: "icons/cardsmith-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icons/cardsmith-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "icons/cardsmith-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{html,js,css,png,svg,webmanifest}"],
        navigateFallback: "index.html"
      }
    })
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
