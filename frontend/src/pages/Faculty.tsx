// src/pages/Faculty.tsx
// Faculty page.
// Responsibilities:
// - Reuse the shared ChannelPage component
// - Render the "faculty" announcement channel
// - Inherit the faculty color theme from ChannelPage and AnnouncementCard

import ChannelPage from "./ChannelPage";

export default function Faculty() {
  return (
    <ChannelPage
      channel="faculty"
      title="Faculty"
      subtitle="Faculty-wide announcements and notices."
    />
  );
}