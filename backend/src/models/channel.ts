export type ChannelType = "FACULTY" | "MODULE" | "CLUB" | "EMERGENCY";

export type Channel = {
  id: string;
  name: string;
  type: ChannelType;
  isPrivate: boolean;
  createdBy: string;
  members: string[];
  createdAt: string; // ISO string
};
