export type Event = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string; // ISO string
  endsAt: string;   // ISO string
  createdBy: string;
  createdAt: string; // ISO string
};
