import type { AuthUser, UserRole } from "./auth";
import {
  isAcademicOrSuperAdmin,
  isFinanceAdmin,
  isSuperAdmin,
} from "./adminAccess";

export type AuthMode = "login" | "register";

export type AuthActionId =
  | "switch-login"
  | "switch-register"
  | "request-otp"
  | "student-fields"
  | "staff-password"
  | "parent-setup"
  | "support";

export type RoleAssistantKey =
  | "student"
  | "parent"
  | "lecturer"
  | "finance-admin"
  | "academic-admin"
  | "super-admin";

export type AssistantDestinationId =
  | "home"
  | "notifications"
  | "courses"
  | "modules"
  | "faculty"
  | "clubs"
  | "emergency"
  | "uploads"
  | "messages"
  | "calendar"
  | "attendance"
  | "student-results"
  | "manage-results"
  | "admin-finance"
  | "admin-users"
  | "admin-parent-links"
  | "parent-overview"
  | "parent-finance"
  | "parent-results"
  | "parent-calendar"
  | "parent-children"
  | "parent-attendance";

export type AssistantAnswer<ActionId extends string> = {
  text: string;
  actionIds?: ActionId[];
};

export type AssistantWorkflowAnswer = AssistantAnswer<AssistantDestinationId> & {
  followUpText?: string;
  followUpActionIds?: AssistantDestinationId[];
};

export type AssistantDestination = {
  id: AssistantDestinationId;
  label: string;
  path: string;
  keywords: string[];
  description: string;
};

export type AssistantProfile = {
  key: RoleAssistantKey;
  name: string;
  subtitle: string;
  placeholder: string;
  welcome: string;
  overview: string;
  spotlightIds: AssistantDestinationId[];
};

export type AssistantContext = {
  title: string;
  summary: string;
  actionIds: AssistantDestinationId[];
};

type AuthProfile = {
  name: string;
  subtitle: string;
  placeholder: string;
  welcome: string;
};

const APP_NAVIGATION_TERMS = [
  "open",
  "go to",
  "take me to",
  "navigate to",
];
const APP_CAPABILITY_REQUEST_TERMS = [
  "can you",
  "could you",
  "do you",
  "are you able to",
  "please",
];
const APP_CAPABILITY_ACTION_TERMS = [
  "manage",
  "approve",
  "edit",
  "change",
  "delete",
  "remove",
  "create",
  "assign",
  "publish",
  "link",
  "unlink",
  "process",
];
const APP_PARTIAL_TIME_TERMS = [
  "today",
  "yesterday",
  "right now",
  "this week",
  "this month",
];
const APP_WORKFLOW_REQUEST_TERMS = [
  "how do i",
  "how can i",
  "show me how to",
  "where do i go",
  "where do i go to",
  "where do i get to",
  "how do i get to",
  "i want to",
  "i need to",
];
const APP_WORKFLOW_FOLLOW_UP_TERMS = [
  "and then",
  "what next",
  "where after that",
  "after that",
  "then what",
];
const APP_DOMAIN_STATUS_TERMS = [
  "any",
  "is there any",
  "do i have",
  "for me",
];
const APP_PARTIAL_DETAIL_TERMS = [
  "latest",
  "new",
  "recent",
  "pending",
  "activity",
  "activities",
  "tried",
  "attempted",
  "attempt",
  "status",
  "how many",
  "count",
  "counts",
];
const MAX_ASSISTANT_QUICK_ACTIONS = 4;

function includesAny(input: string, terms: string[]) {
  return terms.some((term) => input.includes(term));
}

function normalize(input: string) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
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

function tokenize(input: string): string[] {
  return normalize(input)
    .split(" ")
    .map(normalizeToken)
    .filter(Boolean);
}

function destination(
  id: AssistantDestinationId,
  label: string,
  path: string,
  keywords: string[],
  description: string
): AssistantDestination {
  return { id, label, path, keywords, description };
}

export function getRoleAssistantKey(
  user: Pick<AuthUser, "role" | "adminScope">
): RoleAssistantKey {
  if (user.role === "PARENT") return "parent";
  if (user.role === "LECTURER") return "lecturer";
  if (user.role === "ADMIN" && isFinanceAdmin(user)) return "finance-admin";
  if (user.role === "ADMIN" && isSuperAdmin(user)) return "super-admin";
  if (user.role === "ADMIN" && isAcademicOrSuperAdmin(user)) {
    return "academic-admin";
  }
  return "student";
}

export function getRoleAssistantProfile(
  user: Pick<AuthUser, "role" | "adminScope">
): AssistantProfile {
  const key = getRoleAssistantKey(user);

  switch (key) {
    case "parent":
      return {
        key,
        name: "Harbor",
        subtitle: "Parent portal guide",
        placeholder: "Ask about children, finance, results, or calendar...",
        welcome:
          "I'm Harbor. I can help with your child's results, attendance, finance, and calendar.",
        overview:
          "Ask about results, attendance, finance, linked children, messages, or calendar. I can also open the right page for you.",
        spotlightIds: [
          "parent-results",
          "parent-attendance",
          "parent-finance",
          "parent-calendar",
        ],
      };

    case "lecturer":
      return {
        key,
        name: "Mentor",
        subtitle: "Lecturer workspace guide",
        placeholder:
          "Ask about modules, messages, uploads, attendance, or results...",
        welcome:
          "I'm Mentor. I can help with attendance, announcements, modules, calendar, and result workflows.",
        overview:
          "Ask about attendance, announcements, modules, calendar, uploads, messages, or result workflows. I can also open the right page for you.",
        spotlightIds: ["attendance", "notifications", "calendar", "modules"],
      };

    case "finance-admin":
      return {
        key,
        name: "Ledger",
        subtitle: "Finance admin guide",
        placeholder:
          "Ask about finance accounts, statements, notices, or messages...",
        welcome:
          "I'm Ledger. I can help you review finance accounts, statements, messages, and the finance workspace.",
        overview:
          "Ask about finance accounts, statements, messages, or where to go next in the finance workspace.",
        spotlightIds: ["admin-finance", "messages"],
      };

    case "academic-admin":
      return {
        key,
        name: "Atlas",
        subtitle: "Academic admin guide",
        placeholder:
          "Ask about accounts, approvals, results, modules, or notifications...",
        welcome:
          "I'm Atlas. I can help with accounts, parent link approvals, announcements, results, and admin navigation.",
        overview:
          "Ask about accounts, approvals, results, messages, calendar, uploads, or where to go next. I can also open the right page for you.",
        spotlightIds: [
          "admin-users",
          "notifications",
          "admin-parent-links",
          "manage-results",
        ],
      };

    case "super-admin":
      return {
        key,
        name: "Sparky",
        subtitle: "Super admin guide",
        placeholder:
          "Ask about accounts, approvals, results, or navigation...",
        welcome:
          "I'm Sparky. I can help with accounts, approvals, announcements, and admin navigation.",
        overview:
          "Ask about accounts, approvals, results, messages, or where to go next. I can also open the right page for you.",
        spotlightIds: [
          "admin-users",
          "notifications",
          "admin-parent-links",
          "manage-results",
        ],
      };

    default:
      return {
        key,
        name: "Pulse",
        subtitle: "Student success guide",
        placeholder:
          "Ask about modules, results, messages, uploads, or attendance...",
        welcome:
          "I'm Pulse. I can help with results, attendance, announcements, and your schedule.",
        overview:
          "Ask about results, attendance, announcements, calendar, modules, messages, or uploads. I can also open the right page for you.",
        spotlightIds: ["student-results", "attendance", "notifications", "calendar"],
      };
  }
}

export function getAuthAssistantProfile(
  mode: AuthMode,
  role: UserRole
): AuthProfile {
  if (mode === "login") {
    return {
      name: "Sparky",
      subtitle: "Login guide",
      placeholder: "Ask about OTP, student number, or signing in...",
      welcome:
        "I am Sparky. I can guide you through sign-in, OTP, and the extra fields student accounts need on the login page.",
    };
  }

  switch (role) {
    case "PARENT":
      return {
        name: "Harbor",
        subtitle: "Parent registration guide",
        placeholder:
          "Ask about parent registration, OTP, or getting started...",
        welcome:
          "I am Harbor. I can guide parent registration and show you how the parent portal works after sign-in.",
      };

    case "LECTURER":
      return {
        name: "Mentor",
        subtitle: "Lecturer registration guide",
        placeholder:
          "Ask about lecturer registration, staff password, or OTP...",
        welcome:
          "I am Mentor. I can help you register a lecturer account, explain the staff password, and guide you into the teaching workspace.",
      };

    case "ADMIN":
      return {
        name: "Atlas",
        subtitle: "Admin registration guide",
        placeholder:
          "Ask about admin registration, staff password, or OTP...",
        welcome:
          "I am Atlas. I can walk you through admin registration and explain which steps matter before you reach the admin workspace.",
      };

    default:
      return {
        name: "Pulse",
        subtitle: "Student registration guide",
        placeholder:
          "Ask about South African ID, OTP, or registration...",
        welcome:
          "I am Pulse. I can help students register with South African ID, OTP, and the first places to go once they are inside the app.",
      };
  }
}

export function getAuthContext(mode: AuthMode, role: UserRole) {
  if (mode === "login") {
    return {
      title: "Login help",
      summary:
        "Enter email and password first. Production sign-in requires OTP before submitting the form.",
    };
  }

  switch (role) {
    case "PARENT":
      return {
        title: "Parent registration",
        summary:
          "Parent registration uses email, password, confirm password, and OTP. Parent accounts do not need a student number, South African ID, or staff registration password.",
      };

    case "LECTURER":
    case "ADMIN":
      return {
        title: `${role === "LECTURER" ? "Lecturer" : "Admin"} registration`,
        summary:
          "Staff registration needs email, password, confirm password, OTP, and the shared staff registration password before the account can be created.",
      };

    default:
      return {
        title: "Student registration",
        summary:
          "Student registration needs South African ID, email, password, confirm password, and OTP. The student number is generated after registration.",
      };
  }
}

export function getDefaultAuthActionIds(
  mode: AuthMode,
  role: UserRole
): AuthActionId[] {
  if (mode === "login") {
    return ["request-otp", "switch-register", "support"];
  }

  if (role === "LECTURER" || role === "ADMIN") {
    return ["request-otp", "staff-password", "switch-login", "support"];
  }

  if (role === "PARENT") {
    return ["request-otp", "parent-setup", "switch-login", "support"];
  }

  return ["request-otp", "student-fields", "switch-login", "support"];
}

export function answerAuthQuestion(
  mode: AuthMode,
  role: UserRole,
  rawInput: string
): AssistantAnswer<AuthActionId> {
  const query = normalize(rawInput);
  const authContext = getAuthContext(mode, role);

  if (!query) {
    return {
      text: authContext.summary,
      actionIds: getDefaultAuthActionIds(mode, role),
    };
  }

  if (includesAny(query, ["otp", "one time", "code"])) {
    return {
      text:
        mode === "login"
          ? "Use Request OTP after entering your email. In production, sign-in needs password plus the 6-digit OTP before you can continue."
          : "Registration needs OTP first. Enter your email, click Request OTP, then paste the 6-digit code into the OTP field before creating the account.",
      actionIds: ["request-otp"],
    };
  }

  if (
    includesAny(query, [
      "student number",
      "student id",
      "south african",
      "sa id",
      "student",
    ])
  ) {
    return {
      text:
        mode === "login"
          ? "Student sign-in uses email, password, and OTP when required. Student number stays as an internal reference after login."
          : "Student registration needs a 13-digit South African ID. The student number is generated after the account is created.",
      actionIds: ["student-fields"],
    };
  }

  if (
    includesAny(query, [
      "staff",
      "lecturer",
      "admin",
      "staff password",
      "registration password",
    ])
  ) {
    return {
      text:
        mode === "register"
          ? "Protected admin registration needs the shared staff registration password as well as email, password, confirm password, and OTP."
          : "If you need to create a staff admin account, switch to Register first. Staff registration uses a shared staff registration password plus OTP.",
      actionIds: ["staff-password", "switch-register"],
    };
  }

  if (includesAny(query, ["parent"])) {
    return {
      text:
        "Parent accounts register with email, password, confirm password, and OTP only. Once signed in, parents land in the parent portal where they can work with children, results, finance, calendar, and attendance.",
      actionIds: ["parent-setup", "switch-register"],
    };
  }

  if (includesAny(query, ["register", "sign up", "create account"])) {
    return {
      text:
        "Switch to Register to create a new account. The exact fields change by role so I can keep guiding you once the correct role is selected.",
      actionIds: ["switch-register"],
    };
  }

  if (includesAny(query, ["login", "sign in"])) {
    return {
      text:
        "Switch to Login when you already have an account. Enter email and password first, then use OTP if this environment requires it.",
      actionIds: ["switch-login"],
    };
  }

  if (includesAny(query, ["support", "ticket", "help desk", "cant log in"])) {
    return {
      text:
        "If the form still blocks you, open Support and submit a ticket from there. That is the fastest fallback when credentials, OTP, or account setup need manual help.",
      actionIds: ["support"],
    };
  }

  if (
    includesAny(query, ["after login", "where do i go", "landing", "after sign in"])
  ) {
    return {
      text:
        role === "PARENT"
          ? "Parent accounts land in the parent portal."
          : role === "LECTURER"
            ? "Legacy staff accounts land on the main dashboard."
            : role === "ADMIN"
              ? "Admin accounts land in the admin workspace based on their scope."
              : "Student accounts land on the dashboard and can jump to modules, results, messages, and calendar from there.",
      actionIds: mode === "register" ? ["switch-login"] : undefined,
    };
  }

  return {
    text:
      "I can help with OTP, sign-in, registration requirements, staff passwords, and when to use the support desk.",
    actionIds: getDefaultAuthActionIds(mode, role),
  };
}

function studentDestinations(): AssistantDestination[] {
  return [
    destination(
      "home",
      "Dashboard",
      "/app",
      ["home", "dashboard", "start"],
      "Use the dashboard to catch up on announcements before you jump into modules, messages, results, or calendar."
    ),
    destination(
      "notifications",
      "Notifications",
      "/app/notifications",
      ["notification", "notifications", "alerts"],
      "Notifications gather unread and read updates across messages, attendance, results, emergency notices, and more."
    ),
    destination(
      "courses",
      "Courses",
      "/app/courses",
      ["course", "courses"],
      "Courses shows the course-level academic structure that connects to your modules and learning context."
    ),
    destination(
      "modules",
      "Modules",
      "/app/modules",
      ["module", "modules", "subject", "subjects"],
      "Modules is the quickest place to review linked study modules and the lecturers attached to them."
    ),
    destination(
      "faculty",
      "Faculty",
      "/app/faculty",
      ["faculty", "staff", "lecturer", "lecturers"],
      "Faculty helps you browse people and academic contacts tied to your learning environment."
    ),
    destination(
      "clubs",
      "Clubs",
      "/app/clubs",
      ["club", "clubs", "society", "societies"],
      "Clubs is the social and campus-community area."
    ),
    destination(
      "emergency",
      "Emergency",
      "/app/emergency",
      ["emergency", "urgent", "panic"],
      "Emergency is where urgent notices and emergency guidance live."
    ),
    destination(
      "uploads",
      "Uploads",
      "/app/uploads",
      ["upload", "uploads", "file", "files", "submission", "submissions", "assessment", "assessments", "assignment", "assignments"],
      "Uploads lets you submit student work and download lecturer materials shared with your account."
    ),
    destination(
      "messages",
      "Messages",
      "/app/messages",
      ["message", "messages", "chat", "thread", "conversation", "inbox"],
      "Messages is where you read threads and contact the people your role is allowed to reach."
    ),
    destination(
      "calendar",
      "Calendar",
      "/app/calendar",
      ["calendar", "event", "events", "schedule", "dates"],
      "Calendar shows upcoming events, deadlines, and date-based planning for your account."
    ),
    destination(
      "attendance",
      "Attendance",
      "/app/attendance",
      ["attendance", "check in", "check-in", "presence"],
      "Attendance is where you review sessions and complete the student check-in flow when available."
    ),
    destination(
      "student-results",
      "Results",
      "/app/results",
      ["result", "results", "grade", "grades", "marks", "report"],
      "Results is the student-only place to view published academic results."
    ),
  ];
}

function lecturerDestinations(): AssistantDestination[] {
  return [
    destination(
      "home",
      "Dashboard",
      "/app",
      ["home", "dashboard", "start"],
      "Use the dashboard for announcements and then move into modules, messages, uploads, attendance, and result workflows."
    ),
    destination(
      "notifications",
      "Notifications",
      "/app/notifications",
      ["notification", "notifications", "alerts"],
      "Notifications centralizes updates that affect your teaching workflow."
    ),
    destination(
      "courses",
      "Courses",
      "/app/courses",
      ["course", "courses"],
      "Courses gives you the broader course structure behind your modules."
    ),
    destination(
      "modules",
      "Modules",
      "/app/modules",
      ["module", "modules", "subject", "subjects"],
      "Modules is where you review the teaching spaces assigned to your lecturer account."
    ),
    destination(
      "faculty",
      "Faculty",
      "/app/faculty",
      ["faculty", "staff", "lecturer", "lecturers"],
      "Faculty helps you see the academic people associated with the app."
    ),
    destination(
      "clubs",
      "Clubs",
      "/app/clubs",
      ["club", "clubs", "society", "societies"],
      "Clubs is the wider campus community area."
    ),
    destination(
      "emergency",
      "Emergency",
      "/app/emergency",
      ["emergency", "urgent", "panic"],
      "Emergency contains urgent notices and campus safety guidance."
    ),
    destination(
      "uploads",
      "Uploads",
      "/app/uploads",
      ["upload", "uploads", "file", "files", "submission", "submissions", "materials", "assessment", "assessments", "assignment", "assignments"],
      "Uploads lets you share lecturer materials, review student submissions, and download the files your role can access."
    ),
    destination(
      "messages",
      "Messages",
      "/app/messages",
      ["message", "messages", "chat", "thread", "conversation", "inbox"],
      "Messages is where you handle role-approved conversations with students, parents, and staff."
    ),
    destination(
      "calendar",
      "Calendar",
      "/app/calendar",
      ["calendar", "event", "events", "schedule", "dates"],
      "Calendar helps you manage class events and date-based planning."
    ),
    destination(
      "attendance",
      "Attendance",
      "/app/attendance",
      ["attendance", "roster", "check in", "check-in", "sessions"],
      "Attendance is where lecturers manage sessions, rosters, and attendance marking."
    ),
    destination(
      "manage-results",
      "Manage Results",
      "/app/manage-results",
      ["manage results", "publish results", "result", "results", "grades", "marks"],
      "Manage Results is where lecturers publish, update, and review learner results."
    ),
  ];
}

function financeAdminDestinations(): AssistantDestination[] {
  return [
    destination(
      "admin-finance",
      "Finance",
      "/app/admin/finance",
      ["finance", "billing", "fees", "statement", "statements", "payment", "payments"],
      "Finance is the main finance admin workspace for accounts, statements, documents, and notifications."
    ),
    destination(
      "messages",
      "Messages",
      "/app/messages",
      ["message", "messages", "chat", "thread", "conversation", "inbox"],
      "Messages is the communication area available from the finance admin workspace."
    ),
  ];
}

function academicAdminDestinations(): AssistantDestination[] {
  return [
    destination(
      "home",
      "Dashboard",
      "/app",
      ["home", "dashboard", "start"],
      "Use the dashboard to monitor the main academic workspace before moving into accounts, approvals, messages, and results."
    ),
    destination(
      "notifications",
      "Notifications",
      "/app/notifications",
      ["notification", "notifications", "alerts"],
      "Notifications helps admins stay ahead of unread activity across the system."
    ),
    destination(
      "courses",
      "Courses",
      "/app/courses",
      ["course", "courses"],
      "Courses shows academic structure and linked modules."
    ),
    destination(
      "modules",
      "Modules",
      "/app/modules",
      ["module", "modules", "subject", "subjects"],
      "Modules helps you inspect the module setup visible to academic admins."
    ),
    destination(
      "faculty",
      "Faculty",
      "/app/faculty",
      ["faculty", "staff", "lecturer", "lecturers"],
      "Faculty helps admins review academic contacts in the system."
    ),
    destination(
      "clubs",
      "Clubs",
      "/app/clubs",
      ["club", "clubs", "society", "societies"],
      "Clubs is the campus community area."
    ),
    destination(
      "emergency",
      "Emergency",
      "/app/emergency",
      ["emergency", "urgent", "panic"],
      "Emergency contains urgent notices and safety guidance."
    ),
    destination(
      "uploads",
      "Uploads",
      "/app/uploads",
      ["upload", "uploads", "file", "files", "submission", "submissions", "materials", "assessment", "assessments", "assignment", "assignments"],
      "Uploads lets academic admins review materials and submissions available to their scope."
    ),
    destination(
      "messages",
      "Messages",
      "/app/messages",
      ["message", "messages", "chat", "thread", "conversation", "inbox"],
      "Messages is the role-approved conversation area."
    ),
    destination(
      "calendar",
      "Calendar",
      "/app/calendar",
      ["calendar", "event", "events", "schedule", "dates"],
      "Calendar supports date-based planning and oversight."
    ),
    destination(
      "attendance",
      "Attendance",
      "/app/attendance",
      ["attendance", "sessions", "roster", "check in", "check-in"],
      "Attendance helps academic admins inspect and manage attendance activity."
    ),
    destination(
      "manage-results",
      "Manage Results",
      "/app/manage-results",
      ["manage results", "publish results", "result", "results", "grades", "marks"],
      "Manage Results is where academic admins can review and maintain published results."
    ),
    destination(
      "admin-users",
      "Accounts",
      "/app/admin/users",
      ["account", "accounts", "users", "user", "roles", "detail", "details", "profile", "profiles"],
      "Accounts is the admin page for managing user records, roles, and account setup."
    ),
    destination(
      "admin-parent-links",
      "Parent Link Approvals",
      "/app/admin/parent-links",
      ["parent link", "parent links", "approval", "approvals", "children", "link requests"],
      "Parent Link Approvals is where admins review and decide child-link requests from parents."
    ),
  ];
}

function parentDestinations(): AssistantDestination[] {
  return [
    destination(
      "parent-overview",
      "Parent Overview",
      "/app/parent",
      ["overview", "parent home", "home", "dashboard"],
      "Parent Overview is the best starting point for linked children, quick stats, and shortcuts into finance, results, calendar, and attendance."
    ),
    destination(
      "notifications",
      "Notifications",
      "/app/notifications",
      ["notification", "notifications", "alerts"],
      "Notifications shows updates relevant to parents across messages, finance, results, attendance, and approvals."
    ),
    destination(
      "parent-results",
      "Results",
      "/app/parent/results",
      ["result", "results", "grade", "grades", "marks", "report"],
      "Results helps parents review the selected child's published academic outcomes."
    ),
    destination(
      "parent-finance",
      "Finance",
      "/app/parent/finance",
      ["finance", "fees", "billing", "statement", "statements", "payment", "payments"],
      "Finance is where parents review statements, account status, and finance documents for a linked child."
    ),
    destination(
      "parent-calendar",
      "Calendar",
      "/app/parent/calendar",
      ["calendar", "event", "events", "schedule", "dates"],
      "Calendar shows events for the selected child inside the parent portal."
    ),
    destination(
      "parent-attendance",
      "Attendance",
      "/app/parent/attendance",
      ["attendance", "presence", "check in", "check-in"],
      "Attendance helps parents review attendance for the selected child."
    ),
    destination(
      "parent-children",
      "Children",
      "/app/parent/children",
      ["children", "child", "link child", "link student", "south african id", "student number"],
      "Children is where parents manage linked learners and submit new child-link requests."
    ),
    destination(
      "uploads",
      "Uploads",
      "/app/uploads",
      ["upload", "uploads", "file", "files", "materials", "assessment", "assessments", "assignment", "assignments"],
      "Uploads lets parents view and download files their linked children are allowed to access."
    ),
    destination(
      "messages",
      "Messages",
      "/app/messages",
      ["message", "messages", "chat", "thread", "conversation", "inbox"],
      "Messages lets parents contact the people their role is allowed to reach."
    ),
  ];
}

export function getAssistantDestinations(
  user: Pick<AuthUser, "role" | "adminScope">
): AssistantDestination[] {
  const key = getRoleAssistantKey(user);

  switch (key) {
    case "parent":
      return parentDestinations();
    case "lecturer":
      return lecturerDestinations();
    case "finance-admin":
      return financeAdminDestinations();
    case "academic-admin":
    case "super-admin":
      return academicAdminDestinations();
    default:
      return studentDestinations();
  }
}

function findAssistantDestinationMatch(
  destinations: AssistantDestination[],
  query: string
): AssistantDestination | undefined {
  const queryTokens = new Set(tokenize(query));
  let bestMatch: AssistantDestination | undefined;
  let bestScore = 0;

  for (const entry of destinations) {
    let entryScore = 0;

    for (const keyword of entry.keywords) {
      const normalizedKeyword = normalize(keyword);
      if (!normalizedKeyword) continue;

      if (` ${query} `.includes(` ${normalizedKeyword} `)) {
        entryScore = Math.max(entryScore, normalizedKeyword.includes(" ") ? 6 : 4);
        continue;
      }

      const keywordTokens = tokenize(keyword);
      if (keywordTokens.length === 0) continue;

      const matchedCount = keywordTokens.filter((token) => queryTokens.has(token)).length;
      if (matchedCount === keywordTokens.length) {
        entryScore = Math.max(entryScore, keywordTokens.length > 1 ? 5 : 3);
      } else if (matchedCount >= 2) {
        entryScore = Math.max(entryScore, 3);
      }
    }

    if (entryScore > bestScore) {
      bestScore = entryScore;
      bestMatch = entry;
    }
  }

  return bestScore >= 3 ? bestMatch : undefined;
}

function isStrongDomainDestination(id: AssistantDestinationId): boolean {
  return !["home", "notifications", "parent-overview"].includes(id);
}

export function getAssistantStrongDomainMatch(
  user: Pick<AuthUser, "role" | "adminScope">,
  rawInput: string
): AssistantDestination | null {
  const query = normalize(rawInput);
  if (!query) return null;

  const matchedDestination = findAssistantDestinationMatch(
    getAssistantDestinations(user),
    query
  );

  if (!matchedDestination || !isStrongDomainDestination(matchedDestination.id)) {
    return null;
  }

  return matchedDestination;
}

function listLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

function spotlightLabels(
  user: Pick<AuthUser, "role" | "adminScope">,
  limit = 3
): string[] {
  const destinations = getAssistantDestinations(user);
  const spotlightIds = getRoleAssistantProfile(user).spotlightIds.slice(0, limit);

  return spotlightIds
    .map((actionId) => destinations.find((entry) => entry.id === actionId)?.label)
    .filter((label): label is string => Boolean(label));
}

function isGreeting(query: string): boolean {
  return [
    "hi",
    "hello",
    "hey",
    "yo",
    "good morning",
    "good afternoon",
    "good evening",
  ].some((term) => query === term || query.startsWith(`${term} `));
}

function buildRoleFallbackText(user: Pick<AuthUser, "role" | "adminScope">): string {
  const labels = spotlightLabels(user);
  if (labels.length === 0) {
    return "Tell me what you want to check, or ask me to open the page you need.";
  }

  return `Try ${listLabels(labels)}, or ask me to open the page you need.`;
}

function buildRoleGreetingText(user: Pick<AuthUser, "role" | "adminScope">): string {
  const labels = spotlightLabels(user);
  if (labels.length === 0) {
    return "Ready when you are. Tell me what you want to check.";
  }

  return `Ready when you are. Try ${listLabels(labels)}.`;
}

function buildRoleHelpText(user: Pick<AuthUser, "role" | "adminScope">): string {
  const labels = spotlightLabels(user);
  if (labels.length === 0) {
    return "I can guide you. Tell me what you want to check.";
  }

  return `I can guide you. Start with ${listLabels(labels)}.`;
}

function isWorkflowRequest(query: string): boolean {
  return includesAny(query, APP_WORKFLOW_REQUEST_TERMS);
}

export function isAssistantWorkflowFollowUp(rawInput: string): boolean {
  return includesAny(normalize(rawInput), APP_WORKFLOW_FOLLOW_UP_TERMS);
}

function suggestedWorkflowActions(
  user: Pick<AuthUser, "role" | "adminScope">,
  currentId: AssistantDestinationId
): AssistantDestinationId[] {
  return followUpIds(currentId, getRoleAssistantProfile(user)).slice(0, 2);
}

function workflowActionLabels(
  user: Pick<AuthUser, "role" | "adminScope">,
  actionIds: AssistantDestinationId[]
): string[] {
  const destinations = getAssistantDestinations(user);
  return actionIds
    .map((actionId) => destinations.find((entry) => entry.id === actionId)?.label)
    .filter((label): label is string => Boolean(label));
}

function buildWorkflowInstruction(
  user: Pick<AuthUser, "role" | "adminScope">,
  destination: AssistantDestination,
  query: string
): string {
  switch (destination.id) {
    case "uploads":
      if (user.role === "LECTURER") {
        return "Open Uploads to share lecturer materials or review student submissions.";
      }
      if (user.role === "PARENT") {
        return "Open Uploads to view or download files available to your linked child.";
      }
      if (user.role === "STUDENT") {
        return "Open Uploads to submit your assessment or other student work.";
      }
      return "Open Uploads to review the materials and submissions available in your scope.";

    case "messages":
      return "Open Messages to choose the conversation or thread you need.";

    case "notifications":
      return "Open Notifications to review unread and recent alerts.";

    case "attendance":
      if (user.role === "STUDENT") {
        return "Open Attendance to review your sessions and use check-in when it is available.";
      }
      if (user.role === "PARENT") {
        return "Open Attendance to review your child's attendance records.";
      }
      if (includesAny(query, ["mark", "submit", "update"])) {
        return "I can't mark attendance directly in chat, but open Attendance, choose the module or session, then update the student statuses there.";
      }
      return "Open Attendance to choose the module or session you need, then review or manage attendance there.";

    case "student-results":
      return "Open Results to view your published academic results.";

    case "parent-results":
      return "Open Results to review your child's published academic results.";

    case "manage-results":
      if (includesAny(query, ["manage", "publish", "update", "edit"])) {
        return "I can't manage result records directly in chat, but open Manage Results to review and update them there.";
      }
      return "Open Manage Results to review the result records you need.";

    case "admin-parent-links":
      return "I can't approve parent link requests in chat, but open Parent Link Approvals to review the pending requests there.";

    case "admin-users":
      return "I can't manage account records in chat, but open Accounts to review users, roles, and account details there.";

    case "parent-finance":
      return "Open Finance to review your linked child's account status, statements, and finance documents.";

    case "admin-finance":
      return "Open Finance to review accounts, statements, documents, and finance notices.";

    case "parent-calendar":
    case "calendar":
      return "Open Calendar to review the dates and events you need.";

    case "parent-children":
      return "Open Children to review linked learners or submit a new child-link request.";

    case "modules":
      return "Open Modules to review the module space you need.";

    case "courses":
      return "Open Courses to review the broader course structure.";

    case "faculty":
      return "Open Faculty to review the academic contacts you need.";

    case "home":
    case "parent-overview":
      return `Open ${destination.label} to start from the main workspace summary for your role.`;

    default:
      return `Open ${destination.label} to continue that task there.`;
  }
}

function buildWorkflowFollowUpText(
  user: Pick<AuthUser, "role" | "adminScope">,
  destination: AssistantDestination,
  followUpActionIds: AssistantDestinationId[]
): string {
  switch (destination.id) {
    case "uploads":
      return "Once Uploads opens, choose the file or submission area that matches what you need.";
    case "messages":
      return "Once Messages opens, choose the thread or conversation you want to continue with.";
    case "notifications":
      return "Once Notifications opens, review the unread items first.";
    case "attendance":
      if (user.role === "STUDENT") {
        return "Once Attendance opens, review the latest sessions or use check-in if it is available.";
      }
      if (user.role === "PARENT") {
        return "Once Attendance opens, review the child or module view you need there.";
      }
      return "Once Attendance opens, choose the right module or session first, then work from that list.";
    case "student-results":
    case "parent-results":
      return "Once Results opens, review the published records listed there.";
    case "manage-results":
      return "Once Manage Results opens, select the learner or result record you need.";
    case "admin-parent-links":
      return "Once Parent Link Approvals opens, review the request details before deciding it there.";
    case "admin-users":
      return "Once Accounts opens, search for the user record or role you need.";
    case "parent-finance":
    case "admin-finance":
      return "Once Finance opens, review the account summary or statement you need.";
    case "parent-children":
      return "Once Children opens, choose the learner you want to review or link.";
    default: {
      const nextLabels = workflowActionLabels(user, followUpActionIds);
      if (nextLabels.length > 0) {
        return `After that, ${listLabels(nextLabels)} ${nextLabels.length === 1 ? "is" : "are"} a useful next place to check.`;
      }
      return `Start with ${destination.label} and follow the steps on that page.`;
    }
  }
}

function buildWorkflowUnavailableAnswer(
  user: Pick<AuthUser, "role" | "adminScope">,
  query: string
): AssistantWorkflowAnswer | null {
  const fallbackActionIds = getRoleAssistantProfile(user).spotlightIds.slice(0, 3);

  if (includesAny(query, ["ticket", "tickets", "support request"])) {
    return {
      text: "There isn't an admin Tickets page in this workspace anymore. I can still point you to the pages available for your role.",
      actionIds: fallbackActionIds,
    };
  }

  if (includesAny(query, ["approval", "approvals", "parent link", "parent links", "link request", "link requests"])) {
    return {
      text: "Parent Link Approvals are only available in the academic or super admin workspace. I can still point you to the pages available for your role.",
      actionIds: fallbackActionIds,
    };
  }

  if (includesAny(query, ["account", "accounts", "user", "users", "details", "profile"])) {
    return {
      text: "Accounts is only available in workspaces that include the Accounts page. I can still point you to the pages available for your role.",
      actionIds: fallbackActionIds,
    };
  }

  if (includesAny(query, ["finance", "fee", "fees", "payment", "payments", "balance", "billing"])) {
    if (user.role === "STUDENT" || user.role === "LECTURER" || user.role === "ADMIN") {
      return {
        text: "I can help check finance in chat for your role, but there isn't a dedicated Finance page in this workspace.",
      };
    }
  }

  if (includesAny(query, ["result", "results", "grade", "grades", "marks"])) {
    if (isFinanceAdmin(user)) {
      return {
        text: "Results workflow guidance isn't available in the finance admin workspace.",
        actionIds: fallbackActionIds,
      };
    }
  }

  if (includesAny(query, ["attendance", "mark attendance"])) {
    if (isFinanceAdmin(user)) {
      return {
        text: "Attendance workflow guidance isn't available in the finance admin workspace.",
        actionIds: fallbackActionIds,
      };
    }
  }

  if (includesAny(query, ["notification", "notifications", "alerts"])) {
    if (isFinanceAdmin(user)) {
      return {
        text: "Your finance admin workspace uses Finance and Messages instead of a separate Notifications page.",
        actionIds: fallbackActionIds,
      };
    }
  }

  if (includesAny(query, ["upload", "uploads", "assessment", "assessments", "assignment", "assignments"])) {
    if (isFinanceAdmin(user)) {
      return {
        text: "Uploads are not available in the finance admin workspace.",
        actionIds: fallbackActionIds,
      };
    }
  }

  return null;
}

export function getAssistantWorkflowAnswer(
  user: Pick<AuthUser, "role" | "adminScope">,
  rawInput: string
): AssistantWorkflowAnswer | null {
  const query = normalize(rawInput);
  if (!query || !isWorkflowRequest(query)) {
    return null;
  }

  const destinations = getAssistantDestinations(user);
  const matchedDestination = findAssistantDestinationMatch(destinations, query);
  if (!matchedDestination) {
    return buildWorkflowUnavailableAnswer(user, query);
  }

  const followUpActionIds = suggestedWorkflowActions(user, matchedDestination.id);

  return {
    text: buildWorkflowInstruction(user, matchedDestination, query),
    actionIds: [matchedDestination.id],
    followUpText: buildWorkflowFollowUpText(user, matchedDestination, followUpActionIds),
    followUpActionIds,
  };
}

export function getAssistantNavigationAnswer(
  user: Pick<AuthUser, "role" | "adminScope">,
  rawInput: string
): AssistantAnswer<AssistantDestinationId> | null {
  const query = normalize(rawInput);
  if (!query || !includesAny(query, APP_NAVIGATION_TERMS)) {
    return null;
  }

  const destinations = getAssistantDestinations(user);
  const matchedDestination = findAssistantDestinationMatch(destinations, query);
  if (!matchedDestination) {
    return null;
  }

  return {
    text: `I can open ${matchedDestination.label} for you. Use the button below when you're ready.`,
    actionIds: [matchedDestination.id],
  };
}

function extractCapabilityActionPhrase(query: string): string | null {
  const prefixes = [
    "can you ",
    "could you ",
    "do you ",
    "are you able to ",
    "please ",
  ];

  for (const prefix of prefixes) {
    if (query.startsWith(prefix)) {
      const phrase = query.slice(prefix.length).trim();
      return phrase || null;
    }
  }

  return null;
}

export function getAssistantUnsupportedActionAnswer(
  user: Pick<AuthUser, "role" | "adminScope">,
  rawInput: string
): AssistantAnswer<AssistantDestinationId> | null {
  const query = normalize(rawInput);
  if (!query || includesAny(query, APP_NAVIGATION_TERMS)) {
    return null;
  }

  if (
    !includesAny(query, APP_CAPABILITY_REQUEST_TERMS) ||
    !includesAny(query, APP_CAPABILITY_ACTION_TERMS)
  ) {
    return null;
  }

  const destinations = getAssistantDestinations(user);
  const matchedDestination = findAssistantDestinationMatch(destinations, query);
  if (!matchedDestination) {
    return null;
  }

  const requestedAction =
    extractCapabilityActionPhrase(query) ?? "do that";

  return {
    text: `I can't ${requestedAction} directly in chat, but I can open the ${matchedDestination.label} page.`,
    actionIds: [matchedDestination.id],
  };
}

function describePartialLimit(query: string): string {
  if (includesAny(query, ["is there any", "do i have", "for me", "any"])) {
    return "whether there are matching items for you";
  }
  if (includesAny(query, ["today"])) return "today's activity";
  if (includesAny(query, ["this week"])) return "this week's activity";
  if (includesAny(query, ["this month"])) return "this month's activity";
  if (includesAny(query, ["how many", "count", "counts"])) return "that filtered count";
  if (includesAny(query, ["latest", "new", "recent"])) return "that exact recent activity";
  return "that exact detail";
}

export function getAssistantPartialUnderstandingAnswer(
  user: Pick<AuthUser, "role" | "adminScope">,
  rawInput: string
): AssistantAnswer<AssistantDestinationId> | null {
  const query = normalize(rawInput);
  if (!query || includesAny(query, APP_NAVIGATION_TERMS)) {
    return null;
  }

  if (
    !includesAny(query, APP_DOMAIN_STATUS_TERMS) &&
    !includesAny(query, APP_PARTIAL_TIME_TERMS) &&
    !includesAny(query, APP_PARTIAL_DETAIL_TERMS)
  ) {
    return null;
  }

  const matchedDestination = getAssistantStrongDomainMatch(user, query);
  if (!matchedDestination) {
    return null;
  }

  const detail = describePartialLimit(query);

  return {
    text: `I can help with ${matchedDestination.label}, but I can't confirm ${detail} directly here. I can open the page for you.`,
    actionIds: [matchedDestination.id],
  };
}

function followUpIds(
  currentId: AssistantDestinationId,
  profile: AssistantProfile
): AssistantDestinationId[] {
  switch (currentId) {
    case "home":
    case "parent-overview":
      return profile.spotlightIds
        .filter((id) => id !== currentId)
        .slice(0, MAX_ASSISTANT_QUICK_ACTIONS);
    case "messages":
      return profile.spotlightIds
        .filter((id) => id !== "messages")
        .slice(0, MAX_ASSISTANT_QUICK_ACTIONS);
    default:
      return profile.spotlightIds
        .filter((id) => id !== currentId)
        .slice(0, MAX_ASSISTANT_QUICK_ACTIONS);
  }
}

export function getCurrentAssistantContext(
  user: Pick<AuthUser, "role" | "adminScope">,
  pathname: string
): AssistantContext {
  const profile = getRoleAssistantProfile(user);
  const destinations = getAssistantDestinations(user);

  if (pathname.startsWith("/app/messages/")) {
    return {
      title: "Conversation",
      summary:
        "You are inside a message thread. Read the history, reply in context, and move back to Messages if you want another conversation.",
      actionIds: followUpIds("messages", profile),
    };
  }

  if (pathname.startsWith("/app/c/")) {
    return {
      title: "Channel",
      summary:
        "You are inside a channel space. Use this area for announcements and route-specific content, then jump back to the dashboard or related work areas when you are done.",
      actionIds: profile.spotlightIds.slice(0, MAX_ASSISTANT_QUICK_ACTIONS),
    };
  }

  const current = destinations.find((entry) => entry.path === pathname);
  if (current) {
    return {
      title: current.label,
      summary: current.description,
      actionIds: followUpIds(current.id, profile),
    };
  }

  return {
    title: "Navigation help",
    summary: profile.overview,
    actionIds: profile.spotlightIds.slice(0, MAX_ASSISTANT_QUICK_ACTIONS),
  };
}

export function answerAppQuestion(
  user: Pick<AuthUser, "role" | "adminScope">,
  pathname: string,
  rawInput: string
): AssistantAnswer<AssistantDestinationId> {
  const query = normalize(rawInput);
  const profile = getRoleAssistantProfile(user);
  const destinations = getAssistantDestinations(user);
  const context = getCurrentAssistantContext(user, pathname);
  const navigationAnswer = getAssistantNavigationAnswer(user, rawInput);
  const unsupportedActionAnswer = getAssistantUnsupportedActionAnswer(user, rawInput);

  if (!query) {
    return {
      text: profile.overview,
      actionIds: profile.spotlightIds,
    };
  }

  if (isGreeting(query)) {
    return {
      text: buildRoleGreetingText(user),
      actionIds: profile.spotlightIds,
    };
  }

  if (navigationAnswer) {
    return navigationAnswer;
  }

  if (unsupportedActionAnswer) {
    return unsupportedActionAnswer;
  }

  if (
    includesAny(query, [
      "where am i",
      "what is this page",
      "what can i do here",
      "this page",
      "here",
    ])
  ) {
    return {
      text: `${context.title}: ${context.summary}`,
      actionIds: context.actionIds,
    };
  }

  if (
    includesAny(query, [
      "help",
      "navigate",
      "navigation",
      "menu",
      "where should i go",
      "what can you do",
    ])
  ) {
    return {
      text: buildRoleHelpText(user),
      actionIds: profile.spotlightIds,
    };
  }

  if (includesAny(query, ["logout", "log out", "sign out"])) {
    return {
      text:
        "Use the Logout button in the left sidebar card. It clears your session and sends you back to the login page.",
    };
  }

  const matchedDestination = findAssistantDestinationMatch(destinations, query);

  if (matchedDestination) {
    return {
      text: `${matchedDestination.label}: ${matchedDestination.description}`,
      actionIds: [matchedDestination.id],
    };
  }

  return {
    text: buildRoleFallbackText(user),
    actionIds: profile.spotlightIds,
  };
}
