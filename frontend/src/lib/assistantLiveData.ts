import { fetchAnnouncements } from "../api/announcements";
import { listCalendar, type CalendarEntry } from "../api/calendar";
import {
  getFinance,
  getParentAttendance,
  getResults,
  getStudentResults,
  listMyChildren,
  type FinanceSummary as ParentFinanceSummary,
  type ParentAttendanceRecord,
  type ParentChild,
  type Result,
} from "../api/parent";
import {
  listAdminFinanceAccounts,
  type AdminFinanceAccount,
} from "./adminFinanceApi";
import { isAcademicOrSuperAdmin, isFinanceAdmin, isSuperAdmin } from "./adminAccess";
import type { AssistantChatTurn } from "./assistantApi";
import {
  getAssistantStrongDomainMatch,
  getRoleAssistantProfile,
  type AssistantDestinationId,
} from "./assistantKnowledge";
import type { AuthUser } from "./auth";
import {
  getMyAttendance,
  listAttendanceModules,
  type AttendanceModule,
} from "./attendanceApi";
import { apiClient } from "./apiClient";
import { listCourses } from "./courseApi";
import type { Announcement, ChannelKey } from "./types";

export type AssistantLiveIntent =
  | "announcements"
  | "attendance"
  | "results"
  | "finance"
  | "calendar";

export type AssistantLiveReply = {
  text: string;
  actionIds?: AssistantDestinationId[];
};

type AssistantLiveResolution =
  | { kind: "intent"; intent: AssistantLiveIntent }
  | { kind: "clarify"; intents?: AssistantLiveIntent[] }
  | { kind: "none" };

type StudentFinanceSummary = {
  userId: string;
  balanceCents: number;
  currency: string;
  accountStatus: string;
  statusNote: string | null;
  updatedAt: string;
};

type ReplyInput = {
  summary: string;
  details?: string[];
  note?: string;
  actionIds?: AssistantDestinationId[];
};

type BroadGuidanceKind = "status" | "guide" | "overall" | "next_step";
type BroadIntentResolution =
  | { kind: "intent"; intent: BroadGuidanceKind }
  | { kind: "clarify"; intents: BroadGuidanceKind[] }
  | { kind: "none" };

type NormalizedIntentQuery = {
  full: string;
  core: string;
  tokenSet: Set<string>;
};

type WeightedPhrase = {
  phrase: string;
  weight: number;
};

type WeightedTokenGroup = {
  tokens: string[];
  weight: number;
  minMatches?: number;
  requireAll?: boolean;
};

type BroadIntentRule = {
  phrases: WeightedPhrase[];
  groups: WeightedTokenGroup[];
};

type IntentSignal = {
  phrase: string;
  weight: number;
};

type IntentScore = {
  intent: AssistantLiveIntent;
  score: number;
};

const INTENT_SIGNALS: Record<AssistantLiveIntent, IntentSignal[]> = {
  announcements: [
    { phrase: "announcement", weight: 4 },
    { phrase: "announcements", weight: 4 },
    { phrase: "notice", weight: 4 },
    { phrase: "notices", weight: 4 },
    { phrase: "update", weight: 2 },
    { phrase: "updates", weight: 2 },
    { phrase: "bulletin", weight: 3 },
    { phrase: "bulletins", weight: 3 },
    { phrase: "campus news", weight: 3 },
    { phrase: "latest announcement", weight: 3 },
    { phrase: "new announcements", weight: 3 },
  ],
  attendance: [
    { phrase: "attendance", weight: 4 },
    { phrase: "presence", weight: 3 },
    { phrase: "present", weight: 2 },
    { phrase: "absence", weight: 3 },
    { phrase: "absences", weight: 3 },
    { phrase: "absent", weight: 3 },
    { phrase: "late", weight: 2 },
    { phrase: "lateness", weight: 2 },
    { phrase: "check in", weight: 2 },
    { phrase: "checkin", weight: 2 },
    { phrase: "missed class", weight: 2 },
    { phrase: "missed classes", weight: 2 },
  ],
  results: [
    { phrase: "result", weight: 4 },
    { phrase: "results", weight: 4 },
    { phrase: "mark", weight: 4 },
    { phrase: "marks", weight: 4 },
    { phrase: "grade", weight: 4 },
    { phrase: "grades", weight: 4 },
    { phrase: "score", weight: 3 },
    { phrase: "scores", weight: 3 },
    { phrase: "performance", weight: 3 },
    { phrase: "report card", weight: 3 },
    { phrase: "academic performance", weight: 3 },
  ],
  finance: [
    { phrase: "finance", weight: 4 },
    { phrase: "fee", weight: 4 },
    { phrase: "fees", weight: 4 },
    { phrase: "payment", weight: 4 },
    { phrase: "payments", weight: 4 },
    { phrase: "balance", weight: 4 },
    { phrase: "billing", weight: 4 },
    { phrase: "bill", weight: 3 },
    { phrase: "bills", weight: 3 },
    { phrase: "unpaid", weight: 3 },
    { phrase: "outstanding", weight: 3 },
    { phrase: "owed", weight: 2 },
    { phrase: "owe", weight: 2 },
  ],
  calendar: [
    { phrase: "calendar", weight: 4 },
    { phrase: "event", weight: 4 },
    { phrase: "events", weight: 4 },
    { phrase: "coming up", weight: 3 },
    { phrase: "upcoming", weight: 2 },
    { phrase: "schedule", weight: 2 },
    { phrase: "scheduled", weight: 2 },
    { phrase: "upcoming items", weight: 3 },
    { phrase: "next event", weight: 3 },
    { phrase: "next events", weight: 3 },
  ],
};

const NAVIGATION_PHRASES = [
  "open",
  "go to",
  "take me to",
  "navigate to",
  "bring me to",
  "switch to",
  "route me to",
  "where can i find",
  "where is",
  "which page",
];
const FOLLOW_UP_PHRASES = [
  "what about",
  "how about",
  "anything new",
  "any updates",
  "what else",
  "anything else",
  "same for",
  "same here",
  "and that",
  "and those",
  "and them",
  "and it",
];
const TOPIC_CONNECTORS = ["and", "also", "plus", "alongside", "together with"];
const AMBIGUOUS_REQUEST_WORDS = ["show", "check", "see", "tell me", "what", "how", "can you", "do i", "my"];
const LEADING_FILLER_PHRASES = [
  "hi",
  "hey",
  "hello",
  "yo",
  "please",
  "can you",
  "could you",
  "would you",
  "i want to know",
  "tell me",
  "i need to know",
  "i want to",
];
const MAX_DETAIL_LINES = 3;
const MIN_CONFIDENT_INTENT_SCORE = 3;
const MIN_AMBIGUOUS_INTENT_SCORE = 2;
const MIN_BROAD_INTENT_SCORE = 4;
const MIN_BROAD_INTENT_DELTA = 2;
const BROAD_INTENT_RULES: Record<BroadGuidanceKind, BroadIntentRule> = {
  status: {
    phrases: [
      { phrase: "what should i check today", weight: 5 },
      { phrase: "what do i need to know", weight: 5 },
      { phrase: "what needs my attention", weight: 5 },
      { phrase: "anything important", weight: 5 },
      { phrase: "anything new", weight: 4 },
      { phrase: "whats new", weight: 4 },
      { phrase: "what is the latest", weight: 4 },
      { phrase: "is there anything new for me", weight: 5 },
      { phrase: "what should i be checking", weight: 5 },
      { phrase: "do i have new things", weight: 5 },
      { phrase: "whats going on", weight: 4 },
      { phrase: "what is going on", weight: 4 },
      { phrase: "any updates", weight: 4 },
    ],
    groups: [
      { tokens: ["latest", "new", "update", "updates", "recent"], weight: 3, minMatches: 1 },
      { tokens: ["important", "attention", "know", "check"], weight: 2, minMatches: 2 },
      { tokens: ["check", "today", "need"], weight: 2, minMatches: 2 },
      { tokens: ["going", "on"], weight: 2, requireAll: true },
      { tokens: ["new", "things"], weight: 2, requireAll: true },
      { tokens: ["anything", "important", "new"], weight: 2, minMatches: 2 },
      { tokens: ["what", "latest"], weight: 2, requireAll: true },
    ],
  },
  guide: {
    phrases: [
      { phrase: "i need a guide", weight: 5 },
      { phrase: "guide me", weight: 5 },
      { phrase: "where do i start", weight: 5 },
      { phrase: "what should i do now", weight: 5 },
      { phrase: "can you guide me", weight: 5 },
      { phrase: "what do i do here", weight: 5 },
      { phrase: "what should i do", weight: 4 },
      { phrase: "help me", weight: 4 },
    ],
    groups: [
      { tokens: ["guide", "help", "start"], weight: 2, minMatches: 2 },
      { tokens: ["where", "start"], weight: 4, requireAll: true },
      { tokens: ["what", "should", "do"], weight: 3, minMatches: 2 },
      { tokens: ["do", "here"], weight: 3, requireAll: true },
      { tokens: ["guide", "me"], weight: 3, requireAll: true },
      { tokens: ["help", "me"], weight: 2, requireAll: true },
    ],
  },
  overall: {
    phrases: [
      { phrase: "how am i doing overall", weight: 5 },
      { phrase: "how are things looking", weight: 5 },
      { phrase: "how is everything going", weight: 5 },
      { phrase: "what is my status", weight: 4 },
      { phrase: "am i okay", weight: 5 },
      { phrase: "how am i doing in general", weight: 5 },
      { phrase: "how am i doing", weight: 4 },
    ],
    groups: [
      { tokens: ["how", "doing"], weight: 3, requireAll: true },
      { tokens: ["overall", "general", "status"], weight: 2 },
      { tokens: ["looking", "going"], weight: 2 },
      { tokens: ["am", "i", "okay"], weight: 4, requireAll: true },
      { tokens: ["everything", "going"], weight: 3, requireAll: true },
    ],
  },
  next_step: {
    phrases: [
      { phrase: "what should i open next", weight: 5 },
      { phrase: "what should i open", weight: 4 },
      { phrase: "what page do i need", weight: 5 },
      { phrase: "where do i go next", weight: 5 },
      { phrase: "take me where i need to be", weight: 5 },
      { phrase: "where should i go", weight: 5 },
      { phrase: "take me somewhere useful", weight: 5 },
    ],
    groups: [
      { tokens: ["open", "next"], weight: 3, requireAll: true },
      { tokens: ["where", "go"], weight: 3, requireAll: true },
      { tokens: ["page", "need"], weight: 3, requireAll: true },
      { tokens: ["take", "where"], weight: 2, requireAll: true },
      { tokens: ["open", "page", "next"], weight: 2, minMatches: 2 },
      { tokens: ["what", "open"], weight: 2, requireAll: true },
      { tokens: ["go", "next"], weight: 2, requireAll: true },
    ],
  },
};

function normalize(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[\u2018\u2019]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (trimmed.length > 4 && trimmed.endsWith("ies")) {
    return `${trimmed.slice(0, -3)}y`;
  }
  if (trimmed.length > 4 && trimmed.endsWith("s") && !trimmed.endsWith("ss")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

function stripLeadingPhrases(input: string, phrases: string[]): string {
  let current = input.trim();
  let changed = true;

  while (changed && current) {
    changed = false;

    for (const phrase of phrases) {
      const normalizedPhrase = normalize(phrase);
      if (!normalizedPhrase) continue;

      if (current === normalizedPhrase) {
        current = "";
        changed = true;
        break;
      }

      const prefix = `${normalizedPhrase} `;
      if (current.startsWith(prefix)) {
        current = current.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }

  return current;
}

function buildNormalizedIntentQuery(input: string): NormalizedIntentQuery {
  const full = normalize(input);
  const stripped = stripLeadingPhrases(full, LEADING_FILLER_PHRASES);
  const core = stripped || full;
  const tokens = core
    .split(" ")
    .map(normalizeToken)
    .filter(Boolean);

  return {
    full,
    core,
    tokenSet: new Set(tokens),
  };
}

function includesPhrase(input: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  if (!input || !normalizedPhrase) return false;
  return ` ${input} `.includes(` ${normalizedPhrase} `);
}

function includesAnyPhrase(input: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includesPhrase(input, phrase));
}

function asTime(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function money(amount: number, currency = "ZAR"): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  const time = asTime(value);
  if (!time) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
}

function formatDateTime(value: string | null | undefined): string {
  const time = asTime(value);
  if (!time) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(time));
}

function childId(child: ParentChild): string {
  const value = child.childUserId ?? child.studentUserId ?? child.userId ?? child.id;
  return typeof value === "string" ? value.trim() : "";
}

function childLabel(child: ParentChild): string {
  const studentRef = child.publicStudentId?.trim();
  return studentRef || child.email;
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function sortAnnouncements(rows: Announcement[]): Announcement[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return asTime(b.createdAt) - asTime(a.createdAt);
  });
}

function sortCalendar(rows: CalendarEntry[]): CalendarEntry[] {
  return [...rows].sort((a, b) => asTime(a.startsAt) - asTime(b.startsAt));
}

function sortResults(rows: Result[]): Result[] {
  return [...rows].sort((a, b) => asTime(b.date) - asTime(a.date));
}

function sortAttendance(rows: ParentAttendanceRecord[]): ParentAttendanceRecord[] {
  return [...rows].sort((a, b) => asTime(b.markedAt || b.date) - asTime(a.markedAt || a.date));
}

function buildReply(input: ReplyInput): AssistantLiveReply {
  const parts = [input.summary.trim()];
  const details = (input.details ?? []).map((line) => line.trim()).filter(Boolean).slice(0, MAX_DETAIL_LINES);

  if (details.length > 0) {
    parts.push(details.map((line) => `- ${line}`).join("\n"));
  }

  if (input.note?.trim()) {
    parts.push(input.note.trim());
  }

  return {
    text: parts.join("\n"),
    actionIds: input.actionIds,
  };
}

function joinNotes(...notes: Array<string | null | undefined>): string | undefined {
  const cleaned = notes.map((note) => String(note ?? "").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" ") : undefined;
}

function countFulfilled<T>(rows: PromiseSettledResult<T>[]): number {
  return rows.filter((row) => row.status === "fulfilled").length;
}

function fulfilledValues<T>(rows: PromiseSettledResult<T>[]): T[] {
  return rows
    .filter((row): row is PromiseFulfilledResult<T> => row.status === "fulfilled")
    .map((row) => row.value);
}

function partialDataNote(loadedCount: number, totalCount: number, scopeLabel: string): string | undefined {
  if (totalCount > 0 && loadedCount > 0 && loadedCount < totalCount) {
    return `Some ${scopeLabel} could not be loaded, so this summary may be partial.`;
  }
  return undefined;
}

function uniqueActionIds(actionIds: AssistantDestinationId[], limit = MAX_DETAIL_LINES): AssistantDestinationId[] {
  const seen = new Set<AssistantDestinationId>();
  const out: AssistantDestinationId[] = [];

  for (const actionId of actionIds) {
    if (seen.has(actionId)) continue;
    seen.add(actionId);
    out.push(actionId);
    if (out.length >= limit) break;
  }

  return out;
}

function roleSpotlightActionIds(user: AuthUser, limit = MAX_DETAIL_LINES): AssistantDestinationId[] {
  return uniqueActionIds(getRoleAssistantProfile(user).spotlightIds, limit);
}

function capabilityFallbackSummary(user: AuthUser): string {
  if (user.role === "PARENT") {
    return "Try results, attendance, finance, or calendar.";
  }

  if (user.role === "LECTURER") {
    return "Try attendance, notifications, calendar, or modules.";
  }

  if (isFinanceAdmin(user)) {
    return "Try finance or messages.";
  }

  if (isSuperAdmin(user)) {
    return "Try accounts, approvals, results, or notifications.";
  }

  if (isAcademicOrSuperAdmin(user)) {
    return "Try accounts, approvals, results, or notifications.";
  }

  return "Try results, attendance, notifications, or calendar.";
}

function intentLabel(intent: AssistantLiveIntent): string {
  if (intent === "announcements") return "announcements";
  if (intent === "attendance") return "attendance";
  if (intent === "results") return "results";
  if (intent === "finance") return "finance";
  return "calendar";
}

function listLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

function buildSupportedTopicsReply(user: AuthUser): AssistantLiveReply {
  return buildReply({
    summary:
      "I can help with announcements, attendance, results, finance, and calendar. Which would you like to check first?",
    note: "You can also use the quick actions below.",
    actionIds: roleSpotlightActionIds(user),
  });
}

function buildAmbiguousIntentReply(
  user: AuthUser,
  intents: AssistantLiveIntent[]
): AssistantLiveReply {
  const labels = intents.map(intentLabel);
  return buildReply({
    summary: `I can help with one topic at a time. Which would you like to check first: ${listLabels(labels)}?`,
    note: "Pick one and I'll keep it focused.",
    actionIds: uniqueActionIds(
      intents.flatMap((intent) => actionIdsForIntent(user, intent))
    ),
  });
}

function broadIntentLabel(intent: BroadGuidanceKind): string {
  if (intent === "status") return "a quick update";
  if (intent === "guide") return "guided help";
  if (intent === "overall") return "an overall check";
  return "a page suggestion";
}

function buildBroadIntentClarificationReply(
  user: AuthUser,
  intents: BroadGuidanceKind[]
): AssistantLiveReply {
  const labels = intents.map(broadIntentLabel);
  return buildReply({
    summary: `I can help with ${listLabels(labels)}. Which would you like first?`,
    note: "You can also use the shortcuts below.",
    actionIds: roleSpotlightActionIds(user),
  });
}

function matchesWeightedGroup(
  query: NormalizedIntentQuery,
  group: WeightedTokenGroup
): boolean {
  const tokens = group.tokens.map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return false;

  const matchedCount = tokens.filter((token) => query.tokenSet.has(token)).length;
  if (group.requireAll) {
    return matchedCount === tokens.length;
  }

  return matchedCount >= (group.minMatches ?? 1);
}

function scoreBroadIntent(
  query: NormalizedIntentQuery,
  intent: BroadGuidanceKind
): number {
  const rule = BROAD_INTENT_RULES[intent];
  let score = 0;

  for (const phrase of rule.phrases) {
    if (includesPhrase(query.core, phrase.phrase) || includesPhrase(query.full, phrase.phrase)) {
      score += phrase.weight;
    }
  }

  for (const group of rule.groups) {
    if (matchesWeightedGroup(query, group)) {
      score += group.weight;
    }
  }

  if (
    intent === "status" &&
    query.tokenSet.has("what") &&
    (query.tokenSet.has("new") || query.tokenSet.has("latest") || query.tokenSet.has("important"))
  ) {
    score += 1;
  }

  if (
    intent === "guide" &&
    query.tokenSet.has("what") &&
    query.tokenSet.has("do")
  ) {
    score += 1;
  }

  if (
    intent === "overall" &&
    query.tokenSet.has("how") &&
    (query.tokenSet.has("looking") || query.tokenSet.has("going") || query.tokenSet.has("status"))
  ) {
    score += 1;
  }

  if (
    intent === "next_step" &&
    (query.tokenSet.has("open") || query.tokenSet.has("page")) &&
    (query.tokenSet.has("next") || query.tokenSet.has("go"))
  ) {
    score += 1;
  }

  return score;
}

function resolveBroadGuidanceIntent(input: string): BroadIntentResolution {
  const query = buildNormalizedIntentQuery(input);
  if (!query.core) {
    return { kind: "none" };
  }

  const scores = (Object.keys(BROAD_INTENT_RULES) as BroadGuidanceKind[])
    .map((intent) => ({
      intent,
      score: scoreBroadIntent(query, intent),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.intent.localeCompare(b.intent));

  const top = scores[0];
  if (!top || top.score < MIN_BROAD_INTENT_SCORE) {
    return { kind: "none" };
  }

  const second = scores[1];
  if (
    second &&
    second.score >= MIN_BROAD_INTENT_SCORE &&
    Math.abs(top.score - second.score) < MIN_BROAD_INTENT_DELTA
  ) {
    return {
      kind: "clarify",
      intents: scores.slice(0, 2).map((row) => row.intent),
    };
  }

  return {
    kind: "intent",
    intent: top.intent,
  };
}

function scoreIntent(query: string, intent: AssistantLiveIntent): IntentScore {
  const score = INTENT_SIGNALS[intent].reduce((sum, signal) => {
    return sum + (includesPhrase(query, signal.phrase) ? signal.weight : 0);
  }, 0);

  if (intent === "calendar" && includesAnyPhrase(query, ["whats coming up", "what is coming up", "coming up next"])) {
    return { intent, score: score + 3 };
  }

  if (intent === "announcements" && includesAnyPhrase(query, ["any new announcements", "new notices", "latest notices"])) {
    return { intent, score: score + 3 };
  }

  if (intent === "announcements" && includesAnyPhrase(query, ["show updates", "latest updates", "campus updates"])) {
    return { intent, score: score + 3 };
  }

  return { intent, score };
}

function sortIntentScores(query: string): IntentScore[] {
  return (Object.keys(INTENT_SIGNALS) as AssistantLiveIntent[])
    .map((intent) => scoreIntent(query, intent))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.intent.localeCompare(b.intent));
}

function isLikelyNavigationQuery(query: string): boolean {
  return includesAnyPhrase(query, NAVIGATION_PHRASES);
}

function isLikelyFollowUpQuery(query: string): boolean {
  const words = query.split(" ").filter(Boolean);
  return (
    includesAnyPhrase(query, FOLLOW_UP_PHRASES) ||
    (query.startsWith("and ") && words.length <= 6) ||
    (includesAnyPhrase(query, ["anything new", "any updates"]) && words.length <= 4)
  );
}

function isLikelyAmbiguousQuery(query: string, scores: IntentScore[]): boolean {
  if (scores.length < 2) return false;
  const topTwo = scores.filter((row) => row.score >= MIN_AMBIGUOUS_INTENT_SCORE).slice(0, 2);
  if (topTwo.length < 2) return false;
  if (includesAnyPhrase(query, TOPIC_CONNECTORS)) return true;
  return Math.abs(topTwo[0].score - topTwo[1].score) <= 1 && includesAnyPhrase(query, AMBIGUOUS_REQUEST_WORDS);
}

function resolveRecentHistoryIntent(history: AssistantChatTurn[]): AssistantLiveIntent | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn.role !== "user") continue;
    const query = buildNormalizedIntentQuery(turn.text).core;
    if (!query || isLikelyNavigationQuery(query)) continue;
    const scores = sortIntentScores(query);
    const top = scores[0];
    if (top && top.score >= MIN_CONFIDENT_INTENT_SCORE) {
      return top.intent;
    }
  }

  return null;
}

function resolveAssistantLiveIntent(input: string): AssistantLiveResolution {
  const query = buildNormalizedIntentQuery(input).core;
  if (!query) return { kind: "none" };
  if (isLikelyNavigationQuery(query)) return { kind: "none" };

  const scores = sortIntentScores(query);
  if (isLikelyAmbiguousQuery(query, scores)) {
    return {
      kind: "clarify",
      intents: scores.slice(0, 2).map((row) => row.intent),
    };
  }

  const top = scores[0];
  if (top && top.score >= MIN_CONFIDENT_INTENT_SCORE) {
    return {
      kind: "intent",
      intent: top.intent,
    };
  }

  if (scores.length > 1 && scores[0].score >= MIN_AMBIGUOUS_INTENT_SCORE) {
    return {
      kind: "clarify",
      intents: scores.slice(0, 2).map((row) => row.intent),
    };
  }

  return { kind: "none" };
}

function resolveAssistantLiveFollowUp(
  input: string,
  history: AssistantChatTurn[] = []
): AssistantLiveResolution {
  const query = buildNormalizedIntentQuery(input).core;
  if (!query || !isLikelyFollowUpQuery(query)) {
    return { kind: "none" };
  }

  const recentIntent = resolveRecentHistoryIntent(history);
  if (recentIntent) {
    return {
      kind: "intent",
      intent: recentIntent,
    };
  }

  return {
    kind: "clarify",
    intents: undefined,
  };
}

function actionIdsForIntent(user: AuthUser, intent: AssistantLiveIntent): AssistantDestinationId[] {
  if (intent === "announcements") {
    if (user.role === "PARENT") return ["notifications", "parent-overview"];
    if (isFinanceAdmin(user)) return [];
    return ["notifications", "home"];
  }

  if (intent === "attendance") {
    if (user.role === "PARENT") return ["parent-attendance", "parent-calendar"];
    if (isFinanceAdmin(user)) return [];
    if (user.role === "LECTURER" || isAcademicOrSuperAdmin(user)) return ["attendance", "calendar"];
    return ["attendance", "calendar"];
  }

  if (intent === "results") {
    if (user.role === "PARENT") return ["parent-results", "parent-calendar"];
    if (user.role === "STUDENT") return ["student-results", "calendar"];
    if (user.role === "LECTURER" || isAcademicOrSuperAdmin(user)) return ["manage-results", "calendar"];
    return [];
  }

  if (intent === "finance") {
    if (user.role === "PARENT") return ["parent-finance", "parent-calendar"];
    if (isFinanceAdmin(user)) return ["admin-finance", "messages"];
    return [];
  }

  if (intent === "calendar") {
    if (isFinanceAdmin(user)) return [];
    return user.role === "PARENT" ? ["parent-calendar", "parent-overview"] : ["calendar", "home"];
  }

  return [];
}

function errorSummaryForIntent(intent: AssistantLiveIntent): string {
  if (intent === "announcements") {
    return "I couldn't load announcements right now.";
  }
  if (intent === "attendance") {
    return "I couldn't load attendance right now.";
  }
  if (intent === "results") {
    return "I couldn't load your results right now.";
  }
  if (intent === "finance") {
    return "I couldn't reach the finance service at the moment.";
  }
  return "I couldn't load calendar events right now.";
}

function buildIntentErrorReply(user: AuthUser, intent: AssistantLiveIntent): AssistantLiveReply {
  return buildReply({
    summary: errorSummaryForIntent(intent),
    note: "Please try again in a moment.",
    actionIds: actionIdsForIntent(user, intent),
  });
}

function formatAnnouncementScope(row: Announcement): string {
  if (row.channel === "modules") {
    return row.moduleCode?.trim() || row.moduleName?.trim() || "Module";
  }
  if (row.channel === "general") return "General";
  if (row.channel === "faculty") return "Faculty";
  if (row.channel === "clubs") return "Clubs";
  if (row.channel === "emergency") return "Emergency";
  return "Announcement";
}

function summarizeAttendanceModules(
  rows: Array<{ moduleCode: string; moduleName: string }>,
  limit = 2
): string[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const row of rows) {
    const code = row.moduleCode?.trim() || "Module";
    const name = row.moduleName?.trim() || "Untitled";
    const key = `${code}|${name}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { label: `${code} - ${name}`, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((entry) => `${entry.label}: ${entry.count} ${pluralize(entry.count, "session")}`);
}

function summarizeAttendanceModuleAccess(rows: AttendanceModule[]): string[] {
  return rows
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, MAX_DETAIL_LINES)
    .map((row) => `${row.code} - ${row.name} (${row.enrolledCount} ${pluralize(row.enrolledCount, "student")})`);
}

function formatResultLine(row: Result, prefix?: string): string {
  const outOf = row.outOf > 0 ? row.outOf : 100;
  const label = prefix ? `${prefix} | ${row.subject}` : row.subject;
  return `${label}: ${row.score}/${outOf} (${formatDate(row.date)})`;
}

function hasParentFinanceActivity(finance: ParentFinanceSummary): boolean {
  return (
    finance.balance !== 0 ||
    String(finance.status ?? "").trim().toUpperCase() !== "OK" ||
    finance.statements > 0 ||
    Boolean(finance.lastPayment) ||
    finance.notifications.length > 0 ||
    finance.documents.length > 0 ||
    Boolean(finance.statusNote?.trim())
  );
}

function hasOwnFinanceActivity(finance: StudentFinanceSummary): boolean {
  return (
    finance.balanceCents !== 0 ||
    String(finance.accountStatus ?? "").trim().toUpperCase() !== "OK" ||
    Boolean(finance.statusNote?.trim())
  );
}

function upcomingRange(daysAhead: number) {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function loadAnnouncementFeed(user: AuthUser) {
  const channels: ChannelKey[] = ["general", "faculty", "clubs", "emergency"];
  const publicSettled = await Promise.allSettled(channels.map((channel) => fetchAnnouncements(channel)));
  const publicLoadedCount = countFulfilled(publicSettled);
  const publicItems = fulfilledValues(publicSettled).flatMap((row) => row);

  let moduleResult = { items: [] as Announcement[], totalCount: 0, loadedCount: 0 };
  let moduleLoadNote: string | undefined;
  try {
    moduleResult = await loadModuleAnnouncements(user);
  } catch {
    moduleLoadNote =
      user.role === "PARENT" || isFinanceAdmin(user)
        ? undefined
        : "Some module announcement feeds could not be loaded, so this summary may be partial.";
  }

  return {
    items: sortAnnouncements(dedupeById([...publicItems, ...moduleResult.items])),
    totalLoaded: publicLoadedCount + moduleResult.loadedCount,
    totalSources: publicSettled.length + moduleResult.totalCount,
    moduleLoadNote,
  };
}

async function loadUpcomingCalendarEntries(
  user: AuthUser,
  daysAhead = 7
): Promise<CalendarEntry[]> {
  if (isFinanceAdmin(user)) return [];

  const range = upcomingRange(daysAhead);
  if (user.role === "PARENT") {
    const children = await loadParentChildren();
    if (children.length === 0) return [];

    const settled = await Promise.allSettled(
      children.map((child) =>
        listCalendar({
          childId: childId(child),
          start: range.start,
          end: range.end,
          limit: 12,
        })
      )
    );

    return sortCalendar(fulfilledValues(settled).flatMap((row) => row));
  }

  return sortCalendar(
    await listCalendar({
      start: range.start,
      end: range.end,
      limit: 12,
    })
  );
}

async function buildStudentBroadGuidanceReply(
  user: AuthUser,
  kind: BroadGuidanceKind,
  query: string
): Promise<AssistantLiveReply> {
  if (kind === "guide") {
    return buildReply({
      summary: "A good place to start is Results, Attendance, Notifications, or Calendar.",
      note: "Choose one below and I will keep the next step practical.",
      actionIds: roleSpotlightActionIds(user),
    });
  }

  if (kind === "next_step") {
    return buildReply({
      summary: "The best places to check next are Results, Attendance, Notifications, and Calendar.",
      note: "Pick one below and I can take you there.",
      actionIds: roleSpotlightActionIds(user),
    });
  }

  if (kind === "overall") {
    const [attendanceResult, resultsResult] = await Promise.allSettled([
      getMyAttendance(),
      getStudentResults(),
    ]);

    const details: string[] = [];
    if (attendanceResult.status === "fulfilled" && attendanceResult.value.value.length > 0) {
      const attendance = attendanceResult.value;
      const moduleCount = new Set(attendance.value.map((row) => row.moduleId)).size;
      details.push(
        `Attendance covers ${attendance.summary.total} ${pluralize(attendance.summary.total, "session")} across ${moduleCount} ${pluralize(moduleCount, "module")}.`
      );
    }

    if (resultsResult.status === "fulfilled" && resultsResult.value.length > 0) {
      const rows = sortResults(resultsResult.value);
      const average =
        rows.reduce((sum, row) => sum + (row.score / Math.max(row.outOf || 100, 1)) * 100, 0) /
        rows.length;
      details.push(`Results include ${rows.length} published ${pluralize(rows.length, "result")} with an average of ${Math.round(average)}%.`);
    }

    if (details.length === 0) {
      return buildReply({
        summary: "There is not much academic data to review yet.",
        note: "Results and Attendance are still the best places to check first.",
        actionIds: uniqueActionIds(["student-results", "attendance", "calendar"]),
      });
    }

    return buildReply({
      summary: "Here is your current academic snapshot.",
      details,
      note: "If you want the full view, I can open Results or Attendance next.",
      actionIds: uniqueActionIds(["student-results", "attendance", "calendar"]),
    });
  }

  const includeFinance = includesAnyPhrase(query, ["account", "finance", "fees", "balance", "payments"]);
  const [announcementResult, resultsResult, calendarResult] = await Promise.allSettled([
    loadAnnouncementFeed(user),
    getStudentResults(),
    loadUpcomingCalendarEntries(user, 7),
  ]);
  const details: string[] = [];
  let financeSummary: StudentFinanceSummary | null = null;

  if (includeFinance) {
    try {
      financeSummary = await apiClient.get<StudentFinanceSummary>("/finance/summary");
    } catch {
      financeSummary = null;
    }
  }

  if (announcementResult.status === "fulfilled" && announcementResult.value.items.length > 0) {
    const count = announcementResult.value.items.length;
    details.push(`${count} active ${pluralize(count, "announcement")} are waiting for you.`);
  }

  if (resultsResult.status === "fulfilled" && resultsResult.value.length > 0) {
    const count = resultsResult.value.length;
    details.push(`${count} published ${pluralize(count, "result")} are available to review.`);
  }

  if (calendarResult.status === "fulfilled" && calendarResult.value.length > 0) {
    const count = calendarResult.value.length;
    details.push(`${count} upcoming calendar ${pluralize(count, "event")} are scheduled in the next 7 days.`);
  }

  if (financeSummary && hasOwnFinanceActivity(financeSummary)) {
    details.push(`Your finance status is ${financeSummary.accountStatus}.`);
  }

  if (details.length === 0) {
    return buildReply({
      summary: "Nothing needs immediate attention right now.",
      note: "Results, Notifications, and Calendar are still the best next checks.",
      actionIds: uniqueActionIds(["student-results", "notifications", "calendar"]),
    });
  }

  return buildReply({
    summary: "Here's the quickest snapshot for today.",
    details,
    note: "If you want, I can open Results, Notifications, or Calendar next.",
    actionIds: uniqueActionIds(["student-results", "notifications", "calendar"]),
  });
}

async function buildParentBroadGuidanceReply(
  user: AuthUser,
  kind: BroadGuidanceKind
): Promise<AssistantLiveReply> {
  const children = await loadParentChildren();
  if (children.length === 0) {
    return buildReply({
      summary: "There isn't a linked child to review yet.",
      note: "Open Children to link a learner first, then I can help with results, attendance, finance, or calendar.",
      actionIds: ["parent-children"],
    });
  }

  if (kind === "guide" || kind === "next_step") {
    return buildReply({
      summary:
        kind === "guide"
          ? `You have ${children.length} linked ${pluralize(children.length, "child")}. I can guide you through results, attendance, finance, or calendar next.`
          : `You have ${children.length} linked ${pluralize(children.length, "child")}.`,
      note:
        kind === "guide"
          ? "Choose what you'd like to review first."
          : "Results, Attendance, Finance, and Calendar are the best next checks.",
      actionIds: roleSpotlightActionIds(user),
    });
  }

  return buildReply({
    summary: `You have ${children.length} linked ${pluralize(children.length, "child")} to keep an eye on.`,
    details: [
      "Results show published academic outcomes.",
      "Attendance helps you review present, late, and absent sessions.",
      "Finance and Calendar are the quickest places to spot account and schedule updates.",
    ],
    note: "Choose the area you'd like to check first.",
    actionIds: roleSpotlightActionIds(user),
  });
}

async function buildLecturerBroadGuidanceReply(
  user: AuthUser,
  kind: BroadGuidanceKind
): Promise<AssistantLiveReply> {
  if (kind === "guide" || kind === "next_step") {
    return buildReply({
      summary:
        kind === "guide"
          ? "A good place to start is Attendance, Notifications, Calendar, or Modules."
          : "The best places to check next are Attendance, Notifications, Calendar, and Modules.",
      note:
        kind === "guide"
          ? "Pick one and I'll keep the next step focused."
          : "Pick one and I can open it for you.",
      actionIds: roleSpotlightActionIds(user),
    });
  }

  const [announcementResult, attendanceResult, calendarResult] = await Promise.allSettled([
    loadAnnouncementFeed(user),
    listAttendanceModules(),
    loadUpcomingCalendarEntries(user, 7),
  ]);

  const details: string[] = [];
  if (announcementResult.status === "fulfilled" && announcementResult.value.items.length > 0) {
    const count = announcementResult.value.items.length;
    details.push(`${count} active ${pluralize(count, "announcement")} are available.`);
  }
  if (attendanceResult.status === "fulfilled" && attendanceResult.value.length > 0) {
    const count = attendanceResult.value.length;
    details.push(`Attendance is available for ${count} ${pluralize(count, "module")}.`);
  }
  if (calendarResult.status === "fulfilled" && calendarResult.value.length > 0) {
    const count = calendarResult.value.length;
    details.push(`${count} upcoming calendar ${pluralize(count, "event")} are scheduled in the next 7 days.`);
  }

  if (details.length === 0) {
    return buildReply({
      summary: "Nothing urgent is standing out in your teaching workspace.",
      note: "Attendance, Notifications, and Calendar are still the best next checks.",
      actionIds: uniqueActionIds(["attendance", "notifications", "calendar"]),
    });
  }

  return buildReply({
    summary: kind === "overall" ? "Here's your current teaching snapshot." : "Here's the quickest view of your teaching workspace.",
    details,
    note: "I can open Attendance, Notifications, Calendar, or Modules next.",
    actionIds: uniqueActionIds(["attendance", "notifications", "calendar"]),
  });
}

async function buildFinanceAdminBroadGuidanceReply(
  user: AuthUser,
  kind: BroadGuidanceKind
): Promise<AssistantLiveReply> {
  if (kind === "guide" || kind === "next_step") {
    return buildReply({
      summary:
        kind === "guide"
          ? "The finance workspace is the right place to start, with Messages as the communication follow-up."
          : "Finance and Messages are the main places to check next.",
      note: "I can open either one for you.",
      actionIds: roleSpotlightActionIds(user),
    });
  }

  const accounts = await listAdminFinanceAccounts({ limit: 100 });
  const flagged = accounts.filter(
    (account) => String(account.status).toUpperCase() !== "OK" || account.balance > 0
  );

  if (flagged.length === 0) {
    return buildReply({
      summary: "No finance accounts need attention right now.",
      note: "Open Finance if you want to review the full list.",
      actionIds: uniqueActionIds(["admin-finance", "messages"]),
    });
  }

  return buildReply({
    summary: `${flagged.length} finance ${pluralize(flagged.length, "account")} need attention right now.`,
    details: flagged
      .slice(0, MAX_DETAIL_LINES)
      .map((account) => `${account.studentNumber?.trim() || account.email}: ${account.status} (${money(account.balance, account.currency)})`),
    note: "Open Finance for the full account list.",
    actionIds: uniqueActionIds(["admin-finance", "messages"]),
  });
}

function buildAdminBroadGuidanceReply(
  user: AuthUser,
  kind: BroadGuidanceKind
): AssistantLiveReply {
  return buildReply({
    summary:
      kind === "guide"
        ? "A good place to start is one of the admin workspace shortcuts below."
        : kind === "next_step"
        ? "The most useful admin shortcuts are below."
        : "These are the admin areas worth checking next.",
    note: "I'll keep suggestions limited to the pages your admin scope already allows.",
    actionIds: roleSpotlightActionIds(user),
  });
}

async function buildBroadGuidanceReply(
  user: AuthUser,
  kind: BroadGuidanceKind,
  query: string
): Promise<AssistantLiveReply> {
  if (user.role === "STUDENT") {
    return buildStudentBroadGuidanceReply(user, kind, query);
  }

  if (user.role === "PARENT") {
    return buildParentBroadGuidanceReply(user, kind);
  }

  if (user.role === "LECTURER") {
    return buildLecturerBroadGuidanceReply(user, kind);
  }

  if (isFinanceAdmin(user)) {
    return buildFinanceAdminBroadGuidanceReply(user, kind);
  }

  return buildAdminBroadGuidanceReply(user, kind);
}

export function detectAssistantLiveIntent(input: string): AssistantLiveIntent | null {
  const resolution = resolveAssistantLiveIntent(input);
  return resolution.kind === "intent" ? resolution.intent : null;
}

async function buildIntentReply(
  user: AuthUser,
  intent: AssistantLiveIntent
): Promise<AssistantLiveReply | null> {
  if (intent === "announcements") return buildAnnouncementsReply(user);
  if (intent === "attendance") {
    if (user.role === "STUDENT") return buildStudentAttendanceReply(user);
    if (user.role === "PARENT") return buildParentAttendanceReply(user);
    return buildStaffAttendanceReply(user);
  }
  if (intent === "results") return buildResultsReply(user);
  if (intent === "finance") return buildFinanceReply(user);
  if (intent === "calendar") return buildCalendarReply(user);
  return null;
}

async function loadModuleAnnouncements(user: AuthUser) {
  if (user.role === "PARENT" || isFinanceAdmin(user)) {
    return { items: [] as Announcement[], totalCount: 0, loadedCount: 0 };
  }

  const courses = await listCourses();
  const moduleIds = Array.from(
    new Set(
      courses.flatMap((course) =>
        course.modules
          .filter((module) => user.role !== "STUDENT" || module.isStudentLinked)
          .map((module) => module.id)
      )
    )
  );

  if (moduleIds.length === 0) {
    return { items: [] as Announcement[], totalCount: 0, loadedCount: 0 };
  }

  const settled = await Promise.allSettled(
    moduleIds.map((moduleId) => fetchAnnouncements("modules", { moduleId }))
  );

  return {
    items: fulfilledValues(settled).flatMap((row) => row),
    totalCount: settled.length,
    loadedCount: countFulfilled(settled),
  };
}

async function buildAnnouncementsReply(user: AuthUser): Promise<AssistantLiveReply> {
  const { items, totalLoaded, totalSources, moduleLoadNote } = await loadAnnouncementFeed(user);

  if (totalSources > 0 && totalLoaded === 0) {
    return buildIntentErrorReply(user, "announcements");
  }

  const summary =
    user.role === "PARENT"
      ? items.length === 0
        ? "There are no active shared announcements right now."
        : `You have ${items.length} active shared ${pluralize(items.length, "announcement")}.`
      : items.length === 0
        ? "There are no active announcements right now."
        : `You have ${items.length} active ${pluralize(items.length, "announcement")}.`;

  if (items.length === 0) {
    return buildReply({
      summary,
      note: joinNotes(
        partialDataNote(totalLoaded, totalSources, "announcement feeds"),
        moduleLoadNote
      ),
      actionIds: actionIdsForIntent(user, "announcements"),
    });
  }

  return buildReply({
    summary,
    details: items.map((row) => `${formatAnnouncementScope(row)}: ${row.title} (${formatDate(row.createdAt)})`),
    note: joinNotes(
      partialDataNote(totalLoaded, totalSources, "announcement feeds"),
      moduleLoadNote
    ),
    actionIds: actionIdsForIntent(user, "announcements"),
  });
}

async function buildStudentAttendanceReply(user: AuthUser): Promise<AssistantLiveReply> {
  const data = await getMyAttendance();
  if (data.value.length === 0) {
    return buildReply({
      summary: "There's no attendance data to review yet.",
      actionIds: actionIdsForIntent(user, "attendance"),
    });
  }

  const latest = [...data.value].sort((a, b) => asTime(b.markedAt) - asTime(a.markedAt))[0];
  const moduleCount = new Set(data.value.map((row) => row.moduleId)).size;

  return buildReply({
    summary: `Attendance is available across ${moduleCount} ${pluralize(moduleCount, "module")} and ${data.summary.total} ${pluralize(data.summary.total, "session")}.`,
    details: [
      `Present: ${data.summary.present} | Late: ${data.summary.late} | Absent: ${data.summary.absent}`,
      ...summarizeAttendanceModules(data.value, 1),
      latest
        ? `Latest: ${latest.moduleCode} - ${latest.moduleName} was ${latest.status} on ${formatDate(latest.date)}`
        : "",
    ],
    actionIds: actionIdsForIntent(user, "attendance"),
  });
}

async function loadParentChildren() {
  const children = await listMyChildren();
  return children.filter((child) => childId(child));
}

async function buildParentAttendanceReply(user: AuthUser): Promise<AssistantLiveReply> {
  const children = await loadParentChildren();
  if (children.length === 0) {
    return buildReply({
      summary: "There isn't a linked child to review for attendance yet.",
      note: "Open Children to link a learner first.",
      actionIds: ["parent-children"],
    });
  }

  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);

  const settled = await Promise.allSettled(
    children.map(async (child) => ({
      child,
      records: await getParentAttendance(childId(child), { from, to }),
    }))
  );

  const loaded = fulfilledValues(settled);
  if (children.length > 0 && loaded.length === 0) {
    return buildIntentErrorReply(user, "attendance");
  }

  const records = sortAttendance(loaded.flatMap((row) => row.records));
  if (records.length === 0) {
    return buildReply({
      summary: "There's no attendance data to review yet.",
      note: partialDataNote(loaded.length, children.length, "linked child attendance records"),
      actionIds: actionIdsForIntent(user, "attendance"),
    });
  }

  const present = records.filter((row) => row.status === "PRESENT").length;
  const late = records.filter((row) => row.status === "LATE").length;
  const absent = records.filter((row) => row.status === "ABSENT").length;
  const moduleCount = new Set(records.map((row) => row.moduleId)).size;
  const latest = records[0];

  return buildReply({
    summary: `Attendance is available for ${children.length} linked ${pluralize(children.length, "child")} across ${moduleCount} ${pluralize(moduleCount, "module")} and ${records.length} ${pluralize(records.length, "session")}.`,
    details: [
      `Present: ${present} | Late: ${late} | Absent: ${absent}`,
      ...summarizeAttendanceModules(records, 1),
      latest
        ? `Latest: ${latest.moduleCode} - ${latest.moduleName} was ${latest.status} on ${formatDate(latest.date)}`
        : "",
    ],
    note: partialDataNote(loaded.length, children.length, "linked child attendance records"),
    actionIds: actionIdsForIntent(user, "attendance"),
  });
}

async function buildStaffAttendanceReply(user: AuthUser): Promise<AssistantLiveReply> {
  if (isFinanceAdmin(user)) {
    return buildReply({
      summary: "Attendance isn't available through chat for finance admin accounts.",
      note: "Attendance chat support is limited to students, parents, academic staff, academic admins, and super admins.",
    });
  }

  const modules = await listAttendanceModules();
  if (modules.length === 0) {
    return buildReply({
      summary: "There are no attendance modules to review right now.",
      actionIds: actionIdsForIntent(user, "attendance"),
    });
  }

  return buildReply({
    summary: `Attendance is available for ${modules.length} ${pluralize(modules.length, "module")}.`,
    details: summarizeAttendanceModuleAccess(modules),
    actionIds: actionIdsForIntent(user, "attendance"),
  });
}

async function buildResultsReply(user: AuthUser): Promise<AssistantLiveReply> {
  if (user.role === "STUDENT") {
    const rows = sortResults(await getStudentResults());
    if (rows.length === 0) {
      return buildReply({
        summary: "There are no published results yet.",
        actionIds: actionIdsForIntent(user, "results"),
      });
    }

    const average =
      rows.reduce((sum, row) => sum + (row.score / Math.max(row.outOf || 100, 1)) * 100, 0) /
      rows.length;

    return buildReply({
      summary: `You have ${rows.length} published ${pluralize(rows.length, "result")}. Average: ${Math.round(average)}%.`,
      details: rows.map((row) => formatResultLine(row)),
      actionIds: actionIdsForIntent(user, "results"),
    });
  }

  if (user.role === "PARENT") {
    const children = await loadParentChildren();
    if (children.length === 0) {
      return buildReply({
        summary: "There isn't a linked child to review for results yet.",
        note: "Open Children to link a learner first.",
        actionIds: ["parent-children"],
      });
    }

    const settled = await Promise.allSettled(
      children.map(async (child) => ({
        child,
        results: await getResults(childId(child)),
      }))
    );

    const loaded = fulfilledValues(settled);
    if (children.length > 0 && loaded.length === 0) {
      return buildIntentErrorReply(user, "results");
    }

    const resultRows = sortResults(
      loaded.flatMap((row) =>
        row.results.map((result) => ({
          ...result,
          id: `${childId(row.child)}:${result.id}`,
          moduleName: result.moduleName,
        }))
      )
    );

    if (resultRows.length === 0) {
      return buildReply({
        summary: "There are no published results yet.",
        note: partialDataNote(loaded.length, children.length, "linked child results"),
        actionIds: actionIdsForIntent(user, "results"),
      });
    }

    const details = loaded
      .flatMap((row) =>
        row.results.map((result) => ({
          child: childLabel(row.child),
          result,
        }))
      )
      .sort((a, b) => asTime(b.result.date) - asTime(a.result.date))
      .map((row) => formatResultLine(row.result, row.child));

    return buildReply({
      summary: `Your linked children have ${resultRows.length} published ${pluralize(resultRows.length, "result")}.`,
      details,
      note: partialDataNote(loaded.length, children.length, "linked child results"),
      actionIds: actionIdsForIntent(user, "results"),
    });
  }

  if (isFinanceAdmin(user)) {
    return buildReply({
      summary: "Results aren't available through chat for finance admin accounts.",
      note: "Results chat support is currently limited to students and parents.",
    });
  }

  return buildReply({
    summary: "Results are currently available through chat for students and parents only.",
    note: "Staff results still require a selected learner or module in Manage Results.",
    actionIds: actionIdsForIntent(user, "results"),
  });
}

async function buildFinanceReply(user: AuthUser): Promise<AssistantLiveReply> {
  if (user.role === "PARENT") {
    const children = await loadParentChildren();
    if (children.length === 0) {
      return buildReply({
        summary: "There isn't a linked child to review for finance yet.",
        note: "Open Children to link a learner first.",
        actionIds: ["parent-children"],
      });
    }

    const settled = await Promise.allSettled(
      children.map(async (child) => ({
        child,
        finance: await getFinance(childId(child)),
      }))
    );

    const loaded = fulfilledValues(settled);
    if (children.length > 0 && loaded.length === 0) {
      return buildIntentErrorReply(user, "finance");
    }

    const activeAccounts = loaded.filter((row) => hasParentFinanceActivity(row.finance));
    if (activeAccounts.length === 0) {
      return buildReply({
        summary: "There are no finance items to review for your linked children.",
        note: partialDataNote(loaded.length, children.length, "linked child finance records"),
        actionIds: actionIdsForIntent(user, "finance"),
      });
    }

    const totalBalance = activeAccounts.reduce((sum, row) => sum + row.finance.balance, 0);
    const attentionCount = activeAccounts.filter((row) => String(row.finance.status).toUpperCase() !== "OK").length;

    return buildReply({
      summary: `${activeAccounts.length} linked finance ${pluralize(activeAccounts.length, "account")} have activity. Total balance: ${money(totalBalance, activeAccounts[0]?.finance.currency ?? "ZAR")}.`,
      details: activeAccounts.map(
        (row) =>
          `${childLabel(row.child)}: ${row.finance.status} (${money(
            row.finance.balance,
            row.finance.currency ?? "ZAR"
          )})`
      ),
      note: joinNotes(
        attentionCount > 0
          ? `${attentionCount} ${pluralize(attentionCount, "account")} currently need attention.`
          : "No linked finance accounts are currently overdue.",
        partialDataNote(loaded.length, children.length, "linked child finance records")
      ),
      actionIds: actionIdsForIntent(user, "finance"),
    });
  }

  if (isFinanceAdmin(user)) {
    const accounts = await listAdminFinanceAccounts({ limit: 250 });
    if (accounts.length === 0) {
      return buildReply({
        summary: "There are no finance accounts to review right now.",
        actionIds: actionIdsForIntent(user, "finance"),
      });
    }

    const flagged = accounts
      .filter((account) => String(account.status).toUpperCase() !== "OK" || account.balance > 0)
      .sort((a, b) => b.balance - a.balance || a.email.localeCompare(b.email));

    if (flagged.length === 0) {
      return buildReply({
        summary: "There are no outstanding finance items right now.",
        details: [`Reviewed ${accounts.length} student ${pluralize(accounts.length, "account")}.`],
        actionIds: actionIdsForIntent(user, "finance"),
      });
    }

    return buildReply({
      summary: `${flagged.length} finance ${pluralize(flagged.length, "account")} need attention.`,
      details: flagged.map(
        (account: AdminFinanceAccount) =>
          `${account.studentNumber?.trim() || account.email}: ${account.status} (${money(
            account.balance,
            account.currency
          )})`
      ),
      note: `Reviewed ${accounts.length} student ${pluralize(accounts.length, "account")}.`,
      actionIds: actionIdsForIntent(user, "finance"),
    });
  }

  if (user.role === "ADMIN") {
    return buildReply({
      summary: "Finance summaries aren't available through chat for this admin role.",
      note: "Finance chat support is available for students, parents, finance admins, and academic staff viewing their own account.",
    });
  }

  const summary = await apiClient.get<StudentFinanceSummary>("/finance/summary");
  const balance = summary.balanceCents / 100;

  if (!hasOwnFinanceActivity(summary)) {
    return buildReply({
      summary: "There are no finance items to review for your account.",
      details: [`Current balance: ${money(balance, summary.currency)} | Status: ${summary.accountStatus}`],
      actionIds: actionIdsForIntent(user, "finance"),
    });
  }

  return buildReply({
    summary: `Your finance status is ${summary.accountStatus}.`,
    details: [`Current balance: ${money(balance, summary.currency)}`],
    note: summary.statusNote?.trim() || undefined,
    actionIds: actionIdsForIntent(user, "finance"),
  });
}

async function buildCalendarReply(user: AuthUser): Promise<AssistantLiveReply> {
  if (isFinanceAdmin(user)) {
    return buildReply({
      summary: "Calendar isn't available through chat for finance admin accounts.",
      note: "Calendar chat support is limited to students, parents, academic staff, academic admins, and super admins.",
    });
  }

  const range = upcomingRange(30);

  if (user.role === "PARENT") {
    const children = await loadParentChildren();
    if (children.length === 0) {
      return buildReply({
        summary: "There isn't a linked child to review for calendar yet.",
        note: "Open Children to link a learner first.",
        actionIds: ["parent-children"],
      });
    }

    const settled = await Promise.allSettled(
      children.map(async (child) => ({
        child,
        entries: await listCalendar({
          childId: childId(child),
          start: range.start,
          end: range.end,
          limit: 25,
        }),
      }))
    );

    const loaded = fulfilledValues(settled);
    if (children.length > 0 && loaded.length === 0) {
      return buildIntentErrorReply(user, "calendar");
    }

    const entries = sortCalendar(loaded.flatMap((row) => row.entries));
    if (entries.length === 0) {
      return buildReply({
        summary: "There are no upcoming calendar items right now.",
        note: partialDataNote(loaded.length, children.length, "linked child calendar feeds"),
        actionIds: actionIdsForIntent(user, "calendar"),
      });
    }

    const details = loaded
      .flatMap((row) =>
        row.entries.map((entry) => ({
          child: childLabel(row.child),
          entry,
        }))
      )
      .sort((a, b) => asTime(a.entry.startsAt) - asTime(b.entry.startsAt))
      .map((row) => `${row.child}: ${row.entry.title} (${formatDateTime(row.entry.startsAt)})`);

    return buildReply({
      summary: `You have ${entries.length} upcoming calendar ${pluralize(entries.length, "event")} in the next 30 days.`,
      details,
      note: partialDataNote(loaded.length, children.length, "linked child calendar feeds"),
      actionIds: actionIdsForIntent(user, "calendar"),
    });
  }

  const entries = sortCalendar(
    await listCalendar({
      start: range.start,
      end: range.end,
      limit: 25,
    })
  );

  if (entries.length === 0) {
    return buildReply({
      summary: "There are no upcoming calendar items right now.",
      actionIds: actionIdsForIntent(user, "calendar"),
    });
  }

  return buildReply({
    summary: `You have ${entries.length} upcoming calendar ${pluralize(entries.length, "event")} in the next 30 days.`,
    details: entries.map((entry) => `${entry.title} (${formatDateTime(entry.startsAt)})`),
    actionIds: actionIdsForIntent(user, "calendar"),
  });
}

export async function getAssistantLiveReply(
  user: AuthUser,
  input: string,
  history: AssistantChatTurn[] = []
): Promise<AssistantLiveReply | null> {
  const normalizedQuery = buildNormalizedIntentQuery(input);
  const specificResolution = resolveAssistantLiveIntent(input);

  if (specificResolution.kind === "clarify") {
    return specificResolution.intents?.length
      ? buildAmbiguousIntentReply(user, specificResolution.intents)
      : buildSupportedTopicsReply(user);
  }

  if (specificResolution.kind === "intent") {
    try {
      return await buildIntentReply(user, specificResolution.intent);
    } catch {
      return buildIntentErrorReply(user, specificResolution.intent);
    }
  }

  if (getAssistantStrongDomainMatch(user, input)) {
    return null;
  }

  const broadResolution = resolveBroadGuidanceIntent(input);
  if (broadResolution.kind === "clarify") {
    return buildBroadIntentClarificationReply(user, broadResolution.intents);
  }

  if (broadResolution.kind === "intent") {
    return buildBroadGuidanceReply(user, broadResolution.intent, normalizedQuery.core);
  }

  const followUpResolution = resolveAssistantLiveFollowUp(input, history);
  if (followUpResolution.kind === "clarify") {
    return buildSupportedTopicsReply(user);
  }

  if (followUpResolution.kind !== "intent") {
    return null;
  }

  try {
    return await buildIntentReply(user, followUpResolution.intent);
  } catch {
    return buildIntentErrorReply(user, followUpResolution.intent);
  }
}

export function getAssistantCapabilityFallback(user: AuthUser): AssistantLiveReply {
  return buildReply({
    summary: capabilityFallbackSummary(user),
    note: "You can also ask me to open the page you need.",
    actionIds: roleSpotlightActionIds(user),
  });
}
