import { createApp } from "./app";
import { env } from "./config/env";

console.log("[boot] starting server...");
console.log("[boot] PORT =", env.PORT);

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[boot] API running on http://localhost:${env.PORT}`);
});

server.on("error", (err) => {
  console.error("[boot] server error:", err);
});
