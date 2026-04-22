import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createChannel, createUser, signJwt } from "./helpers";

describe("Message delete channel binding", () => {
  let lecturerToken = "";
  let channelA = "";
  let channelB = "";
  let messageInChannelB = "";

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    const lecturerA = await createUser("LECTURER");
    const lecturerB = await createUser("LECTURER");

    lecturerToken = signJwt(lecturerA);

    channelA = await createChannel(lecturerA.id, `channel-a-${Date.now()}`);
    channelB = await createChannel(lecturerB.id, `channel-b-${Date.now()}`);

    const inserted = await pool.query<{ id: string }>(
      `
        INSERT INTO messages (channel_id, body, created_by)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [channelB, "message-in-channel-b", lecturerB.id]
    );
    messageInChannelB = inserted.rows[0].id;
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("rejects delete when :messageId does not belong to :channelId", async () => {
    const res = await request(app)
      .delete(`/api/channels/${channelA}/messages/${messageInChannelB}`)
      .set(auth(lecturerToken));

    expect(res.status).toBe(404);

    const stillThere = await pool.query(`SELECT 1 FROM messages WHERE id = $1`, [messageInChannelB]);
    expect((stillThere.rowCount ?? 0)).toBe(1);
  });
});
