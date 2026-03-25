// src/pages/AppHome.tsx
// Dashboard landing page.
// Responsibilities:
// - Reuse the shared ChannelPage component
// - Render the "general" announcement feed as the home dashboard
// - Inherit the shared heading and card styling from ChannelPage

import ChannelPage from "./ChannelPage";

export default function AppHome() {
  return (
    <ChannelPage
      channel="general"
      title="Dashboard"
      subtitle="Announcement feed"
    />
  );
}