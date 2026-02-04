export type ChannelKey = "general" | "modules" | "faculty" | "clubs" | "emergency";

export type Announcement = {
  id: string;
  channel: ChannelKey;
  title: string;
  body: string;
  pinned: boolean;
  author: string;
  createdAt: string; // ISO string
};
