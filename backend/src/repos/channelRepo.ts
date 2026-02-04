import { randomUUID } from "crypto";
import type { Channel, ChannelType } from "../models/channel";
import { channels } from "../store/channelStore";

export const channelRepo = {
  list(): Channel[] {
    return channels;
  },

  create(input: {
    name: string;
    type: ChannelType;
    isPrivate: boolean;
    createdBy: string;
  }): Channel {
    const created: Channel = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      isPrivate: Boolean(input.isPrivate),
      createdBy: input.createdBy,
      members: [],
      createdAt: new Date().toISOString(),
    };

    channels.push(created);
    return created;
  },

  // IMPORTANT: return Channel | null (NOT undefined)
  join(channelId: string, userId: string): Channel | null {
    const ch = channels.find((c) => c.id === channelId);
    if (!ch) return null;

    if (!ch.members.includes(userId)) {
      ch.members.push(userId);
    }
    return ch;
  },
};
