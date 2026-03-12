// src/pages/Modules.tsx
// Modules page.
// Responsibilities:
// - Reuse the shared ChannelPage component
// - Render the "modules" announcement channel
// - Inherit the modules color theme from ChannelPage and AnnouncementCard

import ChannelPage from "./ChannelPage";

export default function Modules() {
  return (
    <ChannelPage
      channel="modules"
      title="Modules"
      subtitle="Module announcements and notices."
    />
  );
}