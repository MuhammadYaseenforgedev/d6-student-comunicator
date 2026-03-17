// src/pages/ChannelPage.tsx
// Generic announcement channel page.
// This page is reused for:
// - Dashboard / Home
// - Modules
// - Faculty
// - Clubs
// - Emergency
// - Dynamic /app/c/:id routes
//
// Responsibilities:
// - Resolve which channel to display
// - Load announcements for that channel
// - Show loading, empty, and error states
// - Allow privileged users to create, edit, and delete announcements
// - Apply brighter neon identity styling per channel

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import NewAnnouncementModal from "../components/NewAnnouncementModal";
import AnnouncementCard from "../components/AnnouncementCard";
import type { ChannelKey } from "../lib/types";
import { useAnnouncements } from "../hooks/useAnnouncements";
import PageHeader from "../components/PageHeader";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import AnnouncementSkeleton from "../components/AnnouncementSkeleton";

type ChannelPageProps = {
  // If provided, the page behaves like a fixed channel page
  // such as Home, Modules, Faculty, Clubs, etc.
  channel?: ChannelKey;
  title?: string;
  subtitle?: string;
};

/**
 * Convert a route parameter into one of the supported channel keys.
 * Falls back to "general" when the route does not match a known static channel.
 */
function asChannelKey(id?: string): ChannelKey {
  if (id === "modules") return "modules";
  if (id === "faculty") return "faculty";
  if (id === "clubs") return "clubs";
  if (id === "emergency") return "emergency";
  return "general";
}

/**
 * Return the stronger neon accent bar class for each channel.
 */
function channelAccentClass(channel: ChannelKey): string {
  if (channel === "modules") {
    return "bg-[#38D5FF]";
  }

  if (channel === "faculty") {
    return "bg-[#35FFE3]";
  }

  if (channel === "clubs") {
    return "bg-[#7B5BFF]";
  }

  if (channel === "emergency") {
    return "bg-[#FF3B3B]";
  }

  return "bg-[#4FA6FF]";
}

/**
 * Return the matching PageHeader tone for each channel.
 */
function channelHeaderTone(
  channel: ChannelKey
): "general" | "modules" | "faculty" | "clubs" | "emergency" {
  if (channel === "modules") return "modules";
  if (channel === "faculty") return "faculty";
  if (channel === "clubs") return "clubs";
  if (channel === "emergency") return "emergency";
  return "general";
}

/**
 * Optional channel helper text color for small supporting text blocks.
 */
function channelSupportGlow(channel: ChannelKey): string {
  if (channel === "modules") return "text-[#8CEBFF]";
  if (channel === "faculty") return "text-[#8FFFEF]";
  if (channel === "clubs") return "text-[#B8A6FF]";
  if (channel === "emergency") return "text-[#FF9C9C]";
  return "text-[#8CCBFF]";
}

export default function ChannelPage(props: ChannelPageProps) {
  const params = useParams<{ id: string }>();

  /**
   * Resolve the channel:
   * - use the explicit prop when this page is being reused statically
   * - otherwise derive it from the route parameter
   */
  const resolvedChannel: ChannelKey = useMemo(() => {
    if (props.channel) return props.channel;
    return asChannelKey(params.id);
  }, [props.channel, params.id]);

  /**
   * Resolve the page title shown in the header.
   */
  const resolvedTitle = useMemo(() => {
    if (props.title) return props.title;
    if (params.id) return `Channel: ${params.id}`;
    return "Channel";
  }, [props.title, params.id]);

  /**
   * Resolve the page subtitle shown in the header.
   */
  const resolvedSubtitle = useMemo(() => {
    if (props.subtitle) return props.subtitle;
    return `Showing announcements for ${resolvedChannel}.`;
  }, [props.subtitle, resolvedChannel]);

  /**
   * Announcement data and actions for the resolved channel.
   */
  const {
    items,
    loading,
    error,
    clearError,
    create,
    update,
    remove,
    canManage,
  } = useAnnouncements(resolvedChannel);

  /**
   * Modal open state for creating a new announcement.
   */
  const [open, setOpen] = useState(false);

  /**
   * Header action button.
   * Only visible to users who are allowed to manage announcements.
   */
  const actions = canManage ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="btn-primary"
      title="Create a new announcement"
      aria-label="Create a new announcement"
    >
      New announcement
    </button>
  ) : null;

  return (
    <div>
      {/* Page heading */}
      <PageHeader
        title={resolvedTitle}
        subtitle={resolvedSubtitle}
        actions={actions}
        tone={channelHeaderTone(resolvedChannel)}
      />

      {/* Small visual identity bar for each channel */}
      <div className="mt-4 flex items-center gap-3">
        <div
          className={[
            "h-1.5 w-28 rounded-full transition-all duration-300",
            channelAccentClass(resolvedChannel),
          ].join(" ")}
        />
        <div
          className={[
            "text-xs font-medium uppercase tracking-[0.22em]",
            channelSupportGlow(resolvedChannel),
          ].join(" ")}
        >
          {resolvedChannel}
        </div>
      </div>

      {/* Error state */}
      {error && <ErrorBanner message={error} onDismiss={clearError} />}

      {/* Main announcement area */}
      <div className="mt-6 space-y-4">
        {loading ? (
          <>
            {/* Loading placeholders */}
            <AnnouncementSkeleton />
            <AnnouncementSkeleton />
            <AnnouncementSkeleton />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            subtitle={
              canManage
                ? "Create the first announcement for this channel."
                : "No announcements available right now."
            }
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="btn-secondary"
                  title="Create announcement"
                  aria-label="Create announcement"
                >
                  Create announcement
                </button>
              ) : undefined
            }
          />
        ) : (
          items.map((a) => (
            <AnnouncementCard
              key={a.id}
              a={a}
              canManage={canManage}
              onUpdate={(id, patch) => update({ id, ...patch })}
              onDelete={remove}
            />
          ))
        )}
      </div>

      {/*
        Key remount pattern:
        This forces the modal to remount when the channel or open state changes.
        It helps avoid stale internal form state when switching contexts.
      */}
      <NewAnnouncementModal
        key={`${resolvedChannel}-${open ? "open" : "closed"}`}
        open={open}
        onClose={() => setOpen(false)}
        defaultChannel={resolvedChannel}
        onCreate={create}
      />
    </div>
  );
}