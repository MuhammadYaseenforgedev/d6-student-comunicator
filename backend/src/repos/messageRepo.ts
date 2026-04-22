import { randomUUID } from "crypto";
import type { Message } from "../models/message";
import { messages } from "../store/messageStore";

export const messageRepo = {
  listByChannel(channelId: string) {
    // newest last (chat style)
    return messages
      .filter((m) => m.channelId === channelId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  create(input: { channelId: string; body: string; createdBy: string }): Message {
    const msg: Message = {
      id: randomUUID(),
      channelId: input.channelId,
      body: input.body,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    messages.push(msg);
    return msg;
  },

  delete(messageId: string) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;
    messages.splice(idx, 1);
    return true;
  },
};
