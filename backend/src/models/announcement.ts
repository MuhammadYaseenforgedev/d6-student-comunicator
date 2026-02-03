export type Announcement = {
  id: string;
  channelId: string;
  title: string;
  body: string;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
};
