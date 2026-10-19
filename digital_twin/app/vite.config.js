import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Chép tài nguyên tĩnh của CesiumJS (Workers, Assets, Widgets, ThirdParty) theo cách của
// ví dụ chính thức https://github.com/CesiumGS/cesium-vite-example
const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`) },
  base: '/',
  // Dữ liệu lớp bản đồ dùng chung với web/ (web/public/data/dt)
  publicDir: '../../web/public',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  server: { port: 5180 },
  build: { chunkSizeWarningLimit: 6000 }, // CesiumJS ~4 MB là bình thường
});
