// src/pages/Clubs.tsx
// Clubs page.
// Responsibilities:
// - Reuse the shared ChannelPage component
// - Render the "clubs" announcement channel
// - Inherit the clubs color theme from ChannelPage and AnnouncementCard

import ChannelPage from "./ChannelPage";

export default function Clubs() {
  return (
    <ChannelPage
      channel="clubs"
      title="Clubs"
      subtitle="Club announcements, events, and updates."
    />
  );
}