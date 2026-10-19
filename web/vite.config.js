import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// CesiumJS (trang Bản đồ số 3D) cần các tài nguyên tĩnh Workers/Assets/Widgets/ThirdParty ở một
// đường dẫn cố định – theo ví dụ chính thức https://github.com/CesiumGS/cesium-vite-example.
// Dùng đường dẫn tuyệt đối vì web dùng BrowserRouter (route lồng nhau như /admin/...).
const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesiumStatic'

// https://vite.dev/config/
export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`) },
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
  build: {
    // Chunk CesiumJS (~4 MB) chỉ tải khi mở trang /ban-do-so
    chunkSizeWarningLimit: 6000,
  },
})
