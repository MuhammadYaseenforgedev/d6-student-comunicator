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
  | "admin-tickets"
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

function includesAny(input: string, terms: string[]) {
  return terms.some((term) => input.includes(term));
}

function normalize(input: string) {
  return input.trim().toLowerCase();
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
          "I am Harbor, your parent portal guide. I can help you follow children, open results, check finance, and move around the parent tools.",
        overview:
          "You can use me to move between the parent overview, linked children, results, finance, calendar, attendance, messages, and uploads.",
        spotlightIds: [
          "parent-overview",
          "parent-results",
          "parent-finance",
          "parent-children",
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
          "I am Mentor, your lecturer assistant. I can point you to teaching spaces, messages, shared materials, attendance, and result management.",
        overview:
          "You can ask me to open modules, messages, uploads, calendar, attendance, or manage results for your teaching workflow.",
        spotlightIds: ["home", "modules", "manage-results", "messages"],
      };

    case "finance-admin":
      return {
        key,
        name: "Ledger",
        subtitle: "Finance admin guide",
        placeholder:
          "Ask about finance accounts, statements, notices, or messages...",
        welcome:
          "I am Ledger, your finance admin guide. I focus on billing, account status, finance documents, and the messages area you can reach from this workspace.",
        overview:
          "You can ask me to open finance or messages and I will keep the guidance limited to the finance admin workspace.",
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
          "I am Atlas, your academic admin guide. I can help you move between academic pages, account management, parent link approvals, and result operations.",
        overview:
          "You can ask me for dashboard pages, accounts, parent link approvals, results, messages, notifications, modules, calendar, and uploads.",
        spotlightIds: [
          "home",
          "admin-users",
          "admin-parent-links",
          "manage-results",
        ],
      };

    case "super-admin":
      return {
        key,
        name: "Command",
        subtitle: "Super admin guide",
        placeholder:
          "Ask about accounts, tickets, approvals, results, or navigation...",
        welcome:
          "I am Command, your super admin guide. I can help you move across the full admin workspace, including tickets, approvals, accounts, and academic operations.",
        overview:
          "You can ask me for admin tools, tickets, account management, result management, messages, notifications, and the main academic pages.",
        spotlightIds: [
          "home",
          "admin-users",
          "admin-parent-links",
          "admin-tickets",
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
          "I am Pulse, your student guide. I can help you signpost modules, results, attendance, messages, uploads, and the rest of your day-to-day app journey.",
        overview:
          "You can ask me to take you to modules, results, calendar, attendance, messages, uploads, notifications, or the dashboard.",
        spotlightIds: ["home", "modules", "student-results", "messages"],
      };
  }
}

export function getAuthAssistantProfile(
  mode: AuthMode,
  role: UserRole
): AuthProfile {
  if (mode === "login") {
    return {
      name: "Beacon",
      subtitle: "Login guide",
      placeholder: "Ask about OTP, student number, or signing in...",
      welcome:
        "I am Beacon. I can guide you through sign-in, OTP, and the extra fields student accounts need on the login page.",
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
          "Ask about student number, South African ID, OTP, or registration...",
        welcome:
          "I am Pulse. I can help students register with the correct identity fields, OTP, and the first places to go once they are inside the app.",
      };
  }
}

export function getAuthContext(mode: AuthMode, role: UserRole) {
  if (mode === "login") {
    return {
      title: "Login help",
      summary:
        "Enter email and password first. Student accounts should also enter a student number, and production sign-in requires OTP before submitting the form.",
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
          "Student registration needs South African ID, student number, email, password, confirm password, and OTP before the account can be created.",
      };
  }
}

export function getDefaultAuthActionIds(
  mode: AuthMode,
  role: UserRole
): AuthActionId[] {
  if (mode === "login") {
    return ["request-otp", "student-fields", "switch-register", "support"];
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
          ? "Student sign-in uses email, password, student number, and OTP when required. Other roles can leave the student number blank on login."
          : "Student registration needs both identity fields: South African ID must be 13 digits, and student number should match the campus record before you submit the form.",
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
          ? "Lecturer and Admin registration needs the shared staff registration password as well as email, password, confirm password, and OTP."
          : "If you need to create a Lecturer or Admin account, switch to Register first. Staff registration uses a shared staff registration password plus OTP.",
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
        "Switch to Login when you already have an account. Enter email and password first, then add student number if you are signing in as a student.",
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
            ? "Lecturer accounts land in the main teaching workspace."
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
      ["upload", "uploads", "file", "files", "submission", "submissions"],
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
      ["upload", "uploads", "file", "files", "submission", "submissions", "materials"],
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

function academicAdminDestinations(includeTickets: boolean): AssistantDestination[] {
  const base: AssistantDestination[] = [
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
      ["upload", "uploads", "file", "files", "submission", "submissions", "materials"],
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
      ["account", "accounts", "users", "user", "roles"],
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

  if (includeTickets) {
    base.push(
      destination(
        "admin-tickets",
        "Tickets",
        "/app/admin/tickets",
        ["ticket", "tickets", "support"],
        "Tickets is the super admin workspace for incoming support requests."
      )
    );
  }

  return base;
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
      ["upload", "uploads", "file", "files", "materials"],
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
      return academicAdminDestinations(false);
    case "super-admin":
      return academicAdminDestinations(true);
    default:
      return studentDestinations();
  }
}

function followUpIds(
  currentId: AssistantDestinationId,
  profile: AssistantProfile
): AssistantDestinationId[] {
  switch (currentId) {
    case "home":
    case "parent-overview":
      return profile.spotlightIds.filter((id) => id !== currentId).slice(0, 3);
    case "messages":
      return profile.spotlightIds
        .filter((id) => id !== "messages")
        .slice(0, 3);
    default:
      return profile.spotlightIds
        .filter((id) => id !== currentId)
        .slice(0, 3);
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
      actionIds: profile.spotlightIds.slice(0, 3),
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
    actionIds: profile.spotlightIds,
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

  if (!query) {
    return {
      text: profile.overview,
      actionIds: profile.spotlightIds,
    };
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
      text: profile.overview,
      actionIds: profile.spotlightIds,
    };
  }

  if (includesAny(query, ["logout", "log out", "sign out"])) {
    return {
      text:
        "Use the Logout button in the left sidebar card. It clears your session and sends you back to the login page.",
    };
  }

  const matchedDestination = destinations.find((entry) =>
    includesAny(query, entry.keywords)
  );

  if (matchedDestination) {
    return {
      text: `${matchedDestination.label}: ${matchedDestination.description}`,
      actionIds: [matchedDestination.id],
    };
  }

  return {
    text:
      "I can guide you to the right area if you ask for a page like messages, results, finance, uploads, attendance, accounts, or children.",
    actionIds: profile.spotlightIds,
  };
}
