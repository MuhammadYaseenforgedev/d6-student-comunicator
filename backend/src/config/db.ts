import { Pool } from "pg";
import { env } from "./env";

const poolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
    }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
    };

export const pool = new Pool(poolConfig);
