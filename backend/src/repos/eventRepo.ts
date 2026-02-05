import { randomUUID } from "crypto";
import type { Event } from "../models/event";
import { events } from "../store/eventStore";

function isValidIsoDate(value: string) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && value.includes("T");
}

export const eventRepo = {
  listByChannel(channelId: string) {
    // Earliest event first (calendar-friendly ordering)
    return events
      .filter((e) => e.channelId === channelId)
      .slice()
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  create(input: {
    channelId: string;
    title: string;
    description?: string;
    location?: string;
    startsAt: string;
    endsAt: string;
    createdBy: string;
  }): Event {
    if (!isValidIsoDate(input.startsAt) || !isValidIsoDate(input.endsAt)) {
      throw new Error("Invalid startsAt or endsAt (must be ISO datetime)");
    }

    const start = new Date(input.startsAt).getTime();
    const end = new Date(input.endsAt).getTime();
    if (end <= start) {
      throw new Error("endsAt must be after startsAt");
    }

    const created: Event = {
      id: randomUUID(),
      channelId: input.channelId,
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    events.push(created);
    return created;
  },

  delete(eventId: string) {
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) return false;
    events.splice(idx, 1);
    return true;
  },
};
