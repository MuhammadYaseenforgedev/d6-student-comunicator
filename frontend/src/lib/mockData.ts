import type { Announcement } from "./types";

const isoHoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

export const mockAnnouncements: Announcement[] = [
  {
    id: "1",
    channel: "emergency",
    title: "Power outage notice",
    body: "There may be a short power outage today between 14:00–16:00.",
    pinned: true,
    author: "Security",
    createdAt: isoHoursAgo(1),
  },
  {
    id: "2",
    channel: "faculty",
    title: "Timetable updates",
    body: "Please check the updated timetable. Some classes changed venues.",
    pinned: true,
    author: "Admin",
    createdAt: isoHoursAgo(20),
  },
  {
    id: "3",
    channel: "modules",
    title: "ADI632: Test 1 moved to Friday",
    body: "Test 1 has been moved to Friday 10:00. Venue will be confirmed.",
    pinned: false,
    author: "Lecturer",
    createdAt: isoHoursAgo(30),
  },
  {
    id: "4",
    channel: "clubs",
    title: "Chess Club tryouts",
    body: "Tryouts this Wednesday at 15:30 in Lab 2. Everyone welcome.",
    pinned: false,
    author: "Club lead",
    createdAt: isoHoursAgo(40),
  },
  {
    id: "5",
    channel: "general",
    title: "Campus Begins",
    body: "Welcome all students!",
    pinned: true,
    author: "Dev User",
    createdAt: isoHoursAgo(2),
  },
];
