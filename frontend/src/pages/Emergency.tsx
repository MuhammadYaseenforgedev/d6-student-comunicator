// src/pages/Emergency.tsx
// Emergency page.
// Responsibilities:
// - Reuse the shared ChannelPage component
// - Render the "emergency" announcement channel
// - Inherit the emergency alert color theme from ChannelPage and AnnouncementCard

import ChannelPage from "./ChannelPage";

export default function Emergency() {
  return (
    <ChannelPage
      channel="emergency"
      title="Emergency"
      subtitle="High priority alerts show here."
    />
  );
}