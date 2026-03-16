import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

type ChannelRow = {
  name?: string;
  type?: string;
};

function toRows(body: unknown): ChannelRow[] {
  if (Array.isArray(body)) return body as ChannelRow[];
  if (body && typeof body === "object" && Array.isArray((body as { value?: unknown }).value)) {
    return (body as { value: ChannelRow[] }).value;
  }
  return [];
}

describe("Channel bootstrap", () => {
  let adminToken = "";

  beforeAll(async () => {
    const admin = await createUser("ADMIN");
    adminToken = signJwt(admin);
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("admin list auto-creates the core channels when the table is empty", async () => {
    await pool.query(`DELETE FROM channels`);

    const res = await request(app)
      .get("/api/channels")
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    const rows = toRows(res.body);
    const names = new Set(rows.map((row) => String(row.name ?? "")));

    expect(names.has("General")).toBe(true);
    expect(names.has("Modules")).toBe(true);
    expect(names.has("Faculty")).toBe(true);
    expect(names.has("Clubs")).toBe(true);
    expect(names.has("Emergency")).toBe(true);
  });
});
