import { env } from "./config/env";
import { app } from "./app";

console.log("[boot] starting server...");
console.log("[boot] env loaded: NODE_ENV =", env.NODE_ENV, "APP_ENV =", env.APP_ENV);
console.log("[boot] PORT =", env.PORT);

const server = app.listen(env.PORT, () => {
  console.log(`[boot] API running on http://localhost:${env.PORT}`);
});

// Log server-level errors
server.on("error", (err) => {
  console.error("[boot] server error:", err);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[boot] received ${signal}, shutting down...`);
  server.close((err) => {
    if (err) {
      console.error("[boot] error during shutdown:", err);
      process.exit(1);
    }
    process.exit(0);
  });

  const forceExitTimer: NodeJS.Timeout = setTimeout(() => process.exit(1), 10_000);
  forceExitTimer.unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
