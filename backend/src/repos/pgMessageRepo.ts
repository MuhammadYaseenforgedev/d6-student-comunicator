import { pool } from "../config/db";
import type { MessageRepo, CreateMessageInput } from "../persistence/types";
import type { Message } from "../models/message";

export const pgMessageRepo: MessageRepo = {
  async create(input: CreateMessageInput): Promise<Message> {
    const { channelId, body, createdBy } = input;

    const result = await pool.query(
      `
      insert into messages (channel_id, body, created_by)
      values ($1, $2, $3)
      returning
        id,
        channel_id as "channelId",
        body,
        created_by as "createdBy",
        created_at as "createdAt"
      `,
      [channelId, body, createdBy]
    );

    return result.rows[0];
  },

  async listByChannel(channelId: string): Promise<Message[]> {
    const result = await pool.query(
      `
      select
        id,
        channel_id as "channelId",
        body,
        created_by as "createdBy",
        created_at as "createdAt"
      from messages
      where channel_id = $1
      order by created_at asc
      `,
      [channelId]
    );

    return result.rows;
  },

  // We'll implement proper delete later if your API needs it.
  // For now we return false to keep the contract stable.
  async delete(_messageId: string): Promise<boolean> {
    return false;
  },
};
