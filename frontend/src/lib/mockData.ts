import type { Announcement } from "./types";

function isoMinus(msAgo: number) {
  return new Date(Date.now() - msAgo).toISOString();
}

export const mockAnnouncements: Announcement[] = [
  {
    id: "1",
    channel: "emergency",
    title: "Power outage notice",
    body: "There may be a short power outage today between 14:00–16:00.",
    pinned: true,
    author: "Security",
    createdAt: isoMinus(1000 * 60 * 60), // 1 hour ago
  },
  {
    id: "2",
    channel: "faculty",
    title: "Timetable updates",
    body: "Please check the updated timetable. Some classes changed venues.",
    pinned: true,
    author: "Admin",
    createdAt: isoMinus(1000 * 60 * 60 * 20), // 20 hours ago
  },
  {
    id: "3",
    channel: "modules",
    title: "ADI632: Test 1 moved to Friday",
    body: "Test 1 has been moved to Friday 10:00. Venue will be confirmed.",
    pinned: false,
    author: "Lecturer",
    createdAt: isoMinus(1000 * 60 * 60 * 30), // 30 hours ago
  },
  {
    id: "4",
    channel: "clubs",
    title: "Chess Club tryouts",
    body: "Tryouts this Wednesday at 15:30 in Lab 2. Everyone welcome.",
    pinned: false,
    author: "Club Lead",
    createdAt: isoMinus(1000 * 60 * 60 * 40), // 40 hours ago
  },
];
