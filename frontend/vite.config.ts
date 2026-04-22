import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    viteEnv.VITE_BACKEND_PROXY_TARGET || process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:5000";

  return {
    plugins: [react()],
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
  };
});
