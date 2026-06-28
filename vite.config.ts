import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // 相对路径 → 同份产物在任意子路径下都跑得动（GitHub Pages /ham-postage/，根目录，自建子路径）。
  base: "./",
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "HAM 寄卡资费比价器",
        short_name: "QSL Postage",
        description: "中国邮政国际/港澳台资费客观比价，为业余无线电 QSL 卡寄送优化。",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        lang: "zh-CN",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // 全部静态资源都预缓存，纯离线可用
        globPatterns: ["**/*.{js,css,html,svg,png,json,ico,webp,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: {
    port: 2469,
    strictPort: true,
  },
});
