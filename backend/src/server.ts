import { app } from "./app";
import { env } from "./config/env";
import { pool } from "./config/db";

console.log("[boot] starting server...");
console.log("[boot] NODE_ENV =", process.env.NODE_ENV ?? "development");
console.log("[boot] PORT =", env.PORT);

// TEMP DEBUG CODE: remove after production DB/login diagnostics are complete.
async function logStartupDbDiagnostics(): Promise<void> {
  try {
    const result = await pool.query<{
      current_database: string;
      current_user: string;
      inet_server_addr: string | null;
      inet_server_port: number | null;
      users_count: string;
    }>(
      `SELECT
         current_database() AS current_database,
         current_user AS current_user,
         inet_server_addr()::text AS inet_server_addr,
         inet_server_port() AS inet_server_port,
         (SELECT COUNT(*)::bigint FROM public.users) AS users_count`
    );

    const row = result.rows[0];
    if (!row) {
      console.log("[DB_DEBUG] startup diagnostics returned no rows");
      return;
    }

    console.log("[DB_DEBUG] current_database =", row.current_database);
    console.log("[DB_DEBUG] current_user =", row.current_user);
    console.log("[DB_DEBUG] inet_server_addr =", row.inet_server_addr);
    console.log("[DB_DEBUG] inet_server_port =", row.inet_server_port);
    console.log("[DB_DEBUG] public.users.count =", row.users_count);
  } catch (err) {
    console.error("[DB_DEBUG] startup diagnostics failed:", err);
  }
}

const server = app.listen(env.PORT, () => {
  console.log(`[boot] API running on http://localhost:${env.PORT}`);
  void logStartupDbDiagnostics();
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
