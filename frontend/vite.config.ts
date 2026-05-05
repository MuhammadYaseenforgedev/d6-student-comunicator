import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("/node_modules/")) return;

          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/")
          ) {
            return "react-vendor";
          }

          if (normalizedId.includes("/node_modules/react-router-dom/")) {
            return "router-vendor";
          }

          if (normalizedId.includes("/node_modules/lucide-react/")) {
            return "icons-vendor";
          }

          if (normalizedId.includes("/node_modules/@fullcalendar/")) {
            return "calendar-vendor";
          }

          if (normalizedId.includes("/node_modules/framer-motion/")) {
            return "motion-vendor";
          }
        },
      },
    },
  },
  server: {
    proxy: {
      // Anything like /api/auth/login or /api/uploads goes to backend
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
