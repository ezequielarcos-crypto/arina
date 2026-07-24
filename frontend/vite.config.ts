import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Arina — Gestión",
        short_name: "Arina",
        description: "ERP para negocio de comidas: productos, recetas, stock, clientes y caja",
        lang: "es-AR",
        start_url: "/",
        display: "standalone",
        background_color: "#fafaf9",
        theme_color: "#292524",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // El service worker nunca debe interceptar la API: datos siempre frescos
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  // Necesario para Tauri
  clearScreen: false,
});
