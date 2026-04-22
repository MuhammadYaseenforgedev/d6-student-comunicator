import { randomUUID } from "crypto";
import type { Channel, ChannelType } from "../models/channel";
import type { ChannelRepo, CreateChannelInput } from "../persistence/types";
import { pool } from "../config/db";

function normalizeMembers(members: unknown): string[] {
  // pg json_agg usually comes back already as an array, but sometimes can be a string
  if (Array.isArray(members)) return members.map(String);
  if (typeof members === "string") {
    try {
      const parsed = JSON.parse(members);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapChannel(row: any): Channel {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ChannelType,
    isPrivate: row.is_private,
    createdBy: row.created_by,
    members: normalizeMembers(row.members),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function getById(channelId: string): Promise<Channel | null> {
  const { rows } = await pool.query(
    `
    SELECT
      c.*,
      COALESCE(
        json_agg(cm.user_id ORDER BY cm.joined_at) FILTER (WHERE cm.user_id IS NOT NULL),
        '[]'::json
      ) AS members
    FROM channels c
    LEFT JOIN channel_members cm ON cm.channel_id = c.id
    WHERE c.id = $1
    GROUP BY c.id
    `,
    [channelId]
  );

  if (rows.length === 0) return null;
  return mapChannel(rows[0]);
}

export const pgChannelRepo: ChannelRepo = {
  async list(): Promise<Channel[]> {
    const { rows } = await pool.query(
      `
      SELECT
        c.*,
        COALESCE(
          json_agg(cm.user_id ORDER BY cm.joined_at) FILTER (WHERE cm.user_id IS NOT NULL),
          '[]'::json
        ) AS members
      FROM channels c
      LEFT JOIN channel_members cm ON cm.channel_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `
    );

    return rows.map(mapChannel);
  },

  async create(input: CreateChannelInput): Promise<Channel> {
    const id = randomUUID();

    await pool.query(
      `
      INSERT INTO channels (id, name, type, is_private, created_by)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [id, input.name, input.type, Boolean(input.isPrivate), input.createdBy]
    );

    // Creator becomes a member by default (keep this behavior)
    await pool.query(
      `
      INSERT INTO channel_members (channel_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (channel_id, user_id) DO NOTHING
      `,
      [id, input.createdBy]
    );

    const created = await getById(id);
    if (!created) throw new Error("Failed to create channel");
    return created;
  },

  async join(channelId: string, userId: string): Promise<Channel | null> {
    const exists = await pool.query(`SELECT 1 FROM channels WHERE id = $1`, [channelId]);
    if (exists.rowCount === 0) return null;

    await pool.query(
      `
      INSERT INTO channel_members (channel_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (channel_id, user_id) DO NOTHING
      `,
      [channelId, userId]
    );

    return getById(channelId);
  },
};
