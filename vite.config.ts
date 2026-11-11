import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/form-twin/",
  plugins: [
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      injectRegister: false,
      scope: "/form-twin/",
      manifest: false,
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "manifest.webmanifest",
      ],
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,png,ico,webmanifest,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [],
        inlineWorkboxRuntime: true,
      },
    }),
  ],
  build: { sourcemap: false },
});
