export type Announcement = {
  id: string;
  channelId: string;
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  title: string;
  body: string;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt?: string | null;
  updatedAt?: string;
};
