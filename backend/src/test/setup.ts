import { pool } from "../config/db";

beforeAll(async () => {
  await pool.query("SELECT 1");
});

afterAll(async () => {
  await pool.end();
});
