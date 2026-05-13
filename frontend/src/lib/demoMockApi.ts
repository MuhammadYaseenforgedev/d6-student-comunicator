import { getUser, type AuthUser } from "./auth";
import { isMockDataMode } from "./demoAuth";

type MockMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type MockRequest = {
  method: MockMethod;
  path: string;
  body?: unknown;
};

type DemoModule = {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  code: string;
  name: string;
  facultyName: string;
  enrolledCount: number;
  lecturers: Array<{ id: string; email: string }>;
};

const now = new Date();
const isoNow = now.toISOString();
const studentId = "demo-student";
const parentId = "demo-parent";
const lecturerId = "demo-lecturer";

function addDays(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateOnly(days: number): string {
  return addDays(days).slice(0, 10);
}

function value<T>(items: T[]) {
  return { value: items, count: items.length };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function currentUser(): AuthUser {
  return (
    getUser() ?? {
      id: studentId,
      email: "student.demo@forge.local",
      role: "STUDENT",
      firstName: "Ayaan",
      lastName: "Khan",
      courseName: "Software Development",
    }
  );
}

const courses = [
  {
    id: "course-software-dev",
    code: "SD-2026",
    name: "Software Development",
    description: "Full-stack software development programme.",
    isActive: true,
    createdAt: isoNow,
    updatedAt: isoNow,
    enrollmentStatus: "ACTIVE",
    enrolledAt: isoNow,
  },
];

const modules: DemoModule[] = [
  {
    id: "mod-core-web",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    courseName: "Software Development",
    code: "CWD101",
    name: "Core Web Development",
    facultyName: "Technology Faculty",
    enrolledCount: 24,
    lecturers: [{ id: lecturerId, email: "lecturer.demo@forge.local" }],
  },
  {
    id: "mod-database",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    courseName: "Software Development",
    code: "DBD101",
    name: "Database Development",
    facultyName: "Technology Faculty",
    enrolledCount: 24,
    lecturers: [{ id: lecturerId, email: "lecturer.demo@forge.local" }],
  },
  {
    id: "mod-cloud",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    courseName: "Software Development",
    code: "CLD101",
    name: "Cloud Fundamentals",
    facultyName: "Technology Faculty",
    enrolledCount: 24,
    lecturers: [{ id: lecturerId, email: "lecturer.demo@forge.local" }],
  },
  {
    id: "mod-communication",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    courseName: "Software Development",
    code: "COM101",
    name: "Communication Skills",
    facultyName: "Professional Skills Faculty",
    enrolledCount: 24,
    lecturers: [{ id: lecturerId, email: "lecturer.demo@forge.local" }],
  },
];

const students = [
  {
    id: studentId,
    userId: studentId,
    email: "ayaan.khan@student.forge.local",
    firstName: "Ayaan",
    lastName: "Khan",
    fullName: "Ayaan",
    surname: "Khan",
    studentNumber: "FA-SD-2026-001",
    publicStudentId: "FA-SD-2026-001",
    idNumber: "0101015009087",
    courseName: "Software Development",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    isComplete: true,
  },
  {
    id: "demo-student-2",
    userId: "demo-student-2",
    email: "thando.mokoena@student.forge.local",
    firstName: "Thando",
    lastName: "Mokoena",
    fullName: "Thando",
    surname: "Mokoena",
    studentNumber: "FA-SD-2026-002",
    publicStudentId: "FA-SD-2026-002",
    idNumber: "0101015009088",
    courseName: "Software Development",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    isComplete: true,
  },
];

function studentProfile(user = currentUser()) {
  return {
    userId: user.role === "STUDENT" ? user.id : studentId,
    email: "ayaan.khan@student.forge.local",
    fullName: "Ayaan",
    surname: "Khan",
    studentNumber: "FA-SD-2026-001",
    idNumber: "0101015009087",
    dateOfBirth: "2001-01-01",
    mobileNumber: "071 000 0001",
    alternativeContactNumber: "071 000 0002",
    streetAddress: "123 Demo Street",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2000",
    emergencyContactName: "Nadia Khan",
    emergencyContactNumber: "071 000 0099",
    feeStatus: "PARTIAL",
    paymentMethod: "EFT",
    amountDue: 2850,
    amountPaid: 7150,
    lastPaymentDate: dateOnly(-10),
    paymentReference: "DEMO-FEE-2026-001",
    courseId: "course-software-dev",
    courseCode: "SD-2026",
    courseName: "Software Development",
    completedAt: isoNow,
    updatedAt: isoNow,
    isComplete: true,
    missingFields: [],
  };
}

const results = [
  { id: "res-web", subject: "Core Web Development", score: 82, outOf: 100, date: dateOnly(-12), moduleId: "mod-core-web", moduleCode: "CWD101", moduleName: "Core Web Development" },
  { id: "res-db", subject: "Database Development", score: 76, outOf: 100, date: dateOnly(-8), moduleId: "mod-database", moduleCode: "DBD101", moduleName: "Database Development" },
  { id: "res-cloud", subject: "Cloud Fundamentals", score: 88, outOf: 100, date: dateOnly(-4), moduleId: "mod-cloud", moduleCode: "CLD101", moduleName: "Cloud Fundamentals" },
  { id: "res-comms", subject: "Communication Skills", score: 79, outOf: 100, date: dateOnly(-2), moduleId: "mod-communication", moduleCode: "COM101", moduleName: "Communication Skills" },
];

const channels = [
  { id: "ch-general", name: "General", type: "MODULE" },
  { id: "ch-modules", name: "Modules", type: "MODULE" },
  { id: "ch-faculty", name: "Faculty", type: "FACULTY" },
  { id: "ch-clubs", name: "Clubs", type: "CLUBS" },
  { id: "ch-emergency", name: "Emergency", type: "EMERGENCY" },
];

function channelKeyFromId(id: string) {
  if (id.includes("emergency")) return "emergency";
  if (id.includes("faculty")) return "faculty";
  if (id.includes("clubs")) return "clubs";
  if (id.includes("modules")) return "modules";
  return "general";
}

function announcements(channelId = "ch-general") {
  const channel = channelKeyFromId(channelId);
  const base = [
    {
      id: `ann-${channel}-welcome`,
      channelId,
      title: "Welcome to Forge Communicator",
      body: "Your local demo workspace is ready with mock academic, finance, attendance, and messaging data.",
      pinned: true,
      createdBy: "admin.demo@forge.local",
      createdAt: addDays(-2),
      expiresAt: null,
    },
    {
      id: `ann-${channel}-assessment`,
      channelId,
      title: "Assessment reminder",
      body: "Core Web Development practical assessment is due this week.",
      pinned: false,
      createdBy: "lecturer.demo@forge.local",
      createdAt: addDays(-1),
      expiresAt: null,
      moduleId: "mod-core-web",
      moduleCode: "CWD101",
      moduleName: "Core Web Development",
    },
    {
      id: `ann-${channel}-campus`,
      channelId,
      title: "Campus update",
      body: "Career workshop registrations are open for Software Development students.",
      pinned: false,
      createdBy: "admin.demo@forge.local",
      createdAt: addDays(-3),
      expiresAt: null,
    },
  ];
  if (channel === "emergency") {
    return [
      {
        id: "ann-emergency-urgent",
        channelId,
        title: "Urgent notice: fire drill",
        body: "A scheduled safety drill will take place at 10:00. Follow academic staff instructions.",
        pinned: true,
        createdBy: "superadmin.demo@forge.local",
        createdAt: addDays(-1),
        expiresAt: null,
      },
      ...base,
    ];
  }
  return base;
}

function notifications(user = currentUser()) {
  return [
    {
      id: "notif-unread-assessment",
      userId: user.id,
      category: "ANNOUNCEMENT",
      type: "ASSESSMENT_REMINDER",
      title: "Assessment reminder",
      body: "Database Development submission closes Friday.",
      meta: { priority: "normal" },
      sourceKey: "res-db",
      isRead: false,
      readAt: null,
      createdAt: addDays(-1),
    },
    {
      id: "notif-high-priority",
      userId: user.id,
      category: "EMERGENCY",
      type: "URGENT_NOTICE",
      title: "High priority campus notice",
      body: "Scheduled fire drill today at 10:00.",
      meta: { priority: "high" },
      sourceKey: "ann-emergency-urgent",
      isRead: false,
      readAt: null,
      createdAt: addDays(0, 7),
    },
    {
      id: "notif-attendance",
      userId: user.id,
      category: "ATTENDANCE",
      type: "ATTENDANCE_REMINDER",
      title: "Attendance reminder",
      body: "Cloud Fundamentals class starts tomorrow at 09:00.",
      meta: { moduleCode: "CLD101" },
      sourceKey: "att-upcoming",
      isRead: false,
      readAt: null,
      createdAt: addDays(-1, 14),
    },
    {
      id: "notif-read-result",
      userId: user.id,
      category: "RESULT",
      type: "RESULT_RELEASED",
      title: "Result released",
      body: "Core Web Development result is available.",
      meta: { score: 82 },
      sourceKey: "res-web",
      isRead: true,
      readAt: addDays(-2),
      createdAt: addDays(-3),
    },
  ];
}

function calendarEntries(user = currentUser()) {
  const ownerId = user.role === "PARENT" ? studentId : user.id;
  return [
    { id: "cal-class-web", userId: ownerId, title: "Core Web Development class", description: "React state and forms", location: "Lab 2", startsAt: addDays(1, 9), endsAt: addDays(1, 11), createdAt: isoNow, courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", source: "COURSE_ENTRY", canDelete: false },
    { id: "cal-assessment-db", userId: ownerId, title: "Database Development assessment due", description: "Submit ERD and SQL script", location: null, startsAt: addDays(3, 16), endsAt: addDays(3, 17), createdAt: isoNow, courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", source: "CALENDAR_ENTRY", canDelete: true },
    { id: "cal-workshop", userId: ownerId, title: "Career workshop", description: "CV review and interview preparation", location: "Auditorium", startsAt: addDays(5, 13), endsAt: addDays(5, 15), createdAt: isoNow, source: "CHANNEL_EVENT", canDelete: false },
    { id: "cal-parent-review", userId: ownerId, title: "Parent academic review", description: "Progress review for Ayaan Khan", location: "Online", startsAt: addDays(7, 15), endsAt: addDays(7, 16), createdAt: isoNow, courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", source: "CALENDAR_ENTRY", canDelete: true },
  ];
}

function attendanceSessions() {
  return [
    {
      id: "att-present",
      lecturerId,
      moduleId: "mod-core-web",
      moduleCode: "CWD101",
      moduleName: "Core Web Development",
      courseId: "course-software-dev",
      courseName: "Software Development",
      facultyName: "Technology Faculty",
      date: dateOnly(-3),
      startsAt: addDays(-3, 9),
      endsAt: addDays(-3, 11),
      attendanceOpenAt: addDays(-3, 8),
      attendanceCloseAt: addDays(-3, 11),
      finalizedAt: addDays(-3, 11),
      createdAt: addDays(-4),
      checkedInAt: addDays(-3, 8),
      checkedInCount: 22,
      summary: { total: 24, present: 20, late: 2, absent: 2, pending: 0, attendancePercentage: 91.7 },
    },
    {
      id: "att-late",
      lecturerId,
      moduleId: "mod-database",
      moduleCode: "DBD101",
      moduleName: "Database Development",
      courseId: "course-software-dev",
      courseName: "Software Development",
      facultyName: "Technology Faculty",
      date: dateOnly(-2),
      startsAt: addDays(-2, 9),
      endsAt: addDays(-2, 11),
      attendanceOpenAt: addDays(-2, 8),
      attendanceCloseAt: addDays(-2, 11),
      finalizedAt: addDays(-2, 11),
      createdAt: addDays(-3),
      checkedInAt: addDays(-2, 9),
      checkedInCount: 20,
      summary: { total: 24, present: 18, late: 2, absent: 4, pending: 0, attendancePercentage: 83.3 },
    },
    {
      id: "att-absent",
      lecturerId,
      moduleId: "mod-cloud",
      moduleCode: "CLD101",
      moduleName: "Cloud Fundamentals",
      courseId: "course-software-dev",
      courseName: "Software Development",
      facultyName: "Technology Faculty",
      date: dateOnly(-1),
      startsAt: addDays(-1, 9),
      endsAt: addDays(-1, 11),
      attendanceOpenAt: addDays(-1, 8),
      attendanceCloseAt: addDays(-1, 11),
      finalizedAt: null,
      createdAt: addDays(-2),
      checkedInAt: null,
      checkedInCount: 19,
      summary: { total: 24, present: 17, late: 2, absent: 3, pending: 2, attendancePercentage: 79.2 },
    },
    {
      id: "att-upcoming",
      lecturerId,
      moduleId: "mod-communication",
      moduleCode: "COM101",
      moduleName: "Communication Skills",
      courseId: "course-software-dev",
      courseName: "Software Development",
      facultyName: "Professional Skills Faculty",
      date: dateOnly(1),
      startsAt: addDays(1, 9),
      endsAt: addDays(1, 11),
      attendanceOpenAt: addDays(1, 8),
      attendanceCloseAt: addDays(1, 11),
      finalizedAt: null,
      createdAt: isoNow,
      checkedInAt: null,
      checkedInCount: 0,
      summary: { total: 24, present: 0, late: 0, absent: 0, pending: 24, attendancePercentage: 0 },
    },
  ];
}

function attendanceSessionById(sessionId: string) {
  return attendanceSessions().find((session) => session.id === sessionId) ?? attendanceSessions()[0];
}

function attendanceMe() {
  const valueRows = [
    { sessionId: "att-present", date: dateOnly(-3), startsAt: addDays(-3, 9), endsAt: addDays(-3, 11), moduleId: "mod-core-web", moduleCode: "CWD101", moduleName: "Core Web Development", facultyName: "Technology Faculty", status: "PRESENT", markedAt: addDays(-3, 11) },
    { sessionId: "att-late", date: dateOnly(-2), startsAt: addDays(-2, 9), endsAt: addDays(-2, 11), moduleId: "mod-database", moduleCode: "DBD101", moduleName: "Database Development", facultyName: "Technology Faculty", status: "LATE", markedAt: addDays(-2, 11) },
    { sessionId: "att-absent", date: dateOnly(-1), startsAt: addDays(-1, 9), endsAt: addDays(-1, 11), moduleId: "mod-cloud", moduleCode: "CLD101", moduleName: "Cloud Fundamentals", facultyName: "Technology Faculty", status: "ABSENT", markedAt: addDays(-1, 11) },
  ];
  return {
    student: students[0],
    summary: { present: 1, absent: 1, late: 1, total: 3 },
    value: valueRows,
    count: valueRows.length,
  };
}

function financeSummary() {
  return {
    balance: 2850,
    currency: "ZAR",
    statements: 2,
    lastPayment: dateOnly(-10),
    status: "PARTIAL",
    statusNote: "Registration fee paid. Monthly tuition is partially paid with a remaining balance.",
    notifications: [
      { id: "fin-reg-paid", title: "Registration fee paid", body: "Registration fee payment received.", severity: "success", createdAt: addDays(-20) },
      { id: "fin-tuition-due", title: "Monthly tuition outstanding", body: "R2,850 due by " + dateOnly(6), severity: "warning", createdAt: addDays(-2) },
    ],
    documents: [
      { id: "fin-doc-reg", kind: "PAYMENT", type: "PAYMENT", title: "Registration fee", amount: -1500, occurredAt: dateOnly(-20), description: "Paid", documentUrl: null },
      { id: "fin-doc-tuition", kind: "INVOICE", type: "INVOICE", title: "Monthly tuition", amount: 2850, occurredAt: dateOnly(-2), description: "Partially paid / outstanding", documentUrl: null },
    ],
  };
}

function adminFinanceDetail() {
  return {
    student: {
      id: studentId,
      email: "ayaan.khan@student.forge.local",
      firstName: "Ayaan",
      lastName: "Khan",
      courseName: "Software Development",
      studentNumber: "FA-SD-2026-001",
      parents: [{ id: parentId, email: "parent.demo@forge.local" }],
    },
    summary: {
      balance: 2850,
      currency: "ZAR",
      status: "PARTIAL",
      statusNote: "Monthly tuition is partially paid; payment due soon.",
      statements: 2,
      lastPayment: dateOnly(-10),
    },
    transactions: [
      { id: "txn-registration", amount: -1500, currency: "ZAR", description: "Registration fee paid", occurredAt: dateOnly(-20), createdAt: addDays(-20) },
      { id: "txn-tuition", amount: 2850, currency: "ZAR", description: "Monthly tuition outstanding", occurredAt: dateOnly(-2), createdAt: addDays(-2) },
    ],
    documents: [
      { id: "doc-statement", type: "STATEMENT", title: "Statement 2026-05", description: "Local demo statement", amount: 2850, currency: "ZAR", issuedAt: dateOnly(-2), documentUrl: null, createdAt: addDays(-2) },
    ],
    notifications: [
      { id: "finance-reminder", title: "Payment due", body: "Monthly tuition balance is due by " + dateOnly(6), severity: "warning", createdAt: addDays(-2) },
    ],
  };
}

function uploads() {
  return [
    { id: "upl-outline", kind: "LECTURER_MATERIAL", originalName: "Course outline PDF placeholder.pdf", mimeType: "application/pdf", sizeBytes: 128000, storagePath: "demo/course-outline.pdf", uploadedBy: lecturerId, uploadedByEmail: "lecturer.demo@forge.local", uploadedByRole: "LECTURER", moduleId: "mod-core-web", moduleCode: "CWD101", moduleName: "Core Web Development", courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", createdAt: addDays(-9) },
    { id: "upl-brief", kind: "LECTURER_MATERIAL", originalName: "Assessment brief placeholder.pdf", mimeType: "application/pdf", sizeBytes: 94000, storagePath: "demo/assessment-brief.pdf", uploadedBy: lecturerId, uploadedByEmail: "lecturer.demo@forge.local", uploadedByRole: "LECTURER", moduleId: "mod-database", moduleCode: "DBD101", moduleName: "Database Development", courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", createdAt: addDays(-5) },
    { id: "upl-slides", kind: "LECTURER_MATERIAL", originalName: "Lecture slides placeholder.pdf", mimeType: "application/pdf", sizeBytes: 220000, storagePath: "demo/slides.pdf", uploadedBy: lecturerId, uploadedByEmail: "lecturer.demo@forge.local", uploadedByRole: "LECTURER", moduleId: "mod-cloud", moduleCode: "CLD101", moduleName: "Cloud Fundamentals", courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", createdAt: addDays(-3) },
    { id: "upl-submission", kind: "STUDENT_SUBMISSION", originalName: "Ayaan Khan database submission.txt", mimeType: "text/plain", sizeBytes: 18000, storagePath: "demo/student-submission.txt", uploadedBy: studentId, uploadedByEmail: "student.demo@forge.local", uploadedByRole: "STUDENT", targetUserId: studentId, targetUserEmail: "student.demo@forge.local", targetUserRole: "STUDENT", moduleId: "mod-database", moduleCode: "DBD101", moduleName: "Database Development", courseId: "course-software-dev", courseCode: "SD-2026", courseName: "Software Development", createdAt: addDays(-1) },
  ];
}

function users() {
  return [
    { id: "demo-super-admin", email: "superadmin.demo@forge.local", role: "ADMIN", adminScope: "SUPER" },
    { id: "demo-academic-admin", email: "academic.demo@forge.local", role: "ADMIN", adminScope: "ACADEMIC" },
    { id: "demo-finance-admin", email: "finance.demo@forge.local", role: "ADMIN", adminScope: "FINANCE" },
    { id: lecturerId, email: "lecturer.demo@forge.local", role: "LECTURER" },
    { id: studentId, email: "student.demo@forge.local", role: "STUDENT" },
    { id: parentId, email: "parent.demo@forge.local", role: "PARENT" },
  ];
}

function supportTickets() {
  return [
    { id: "ticket-open", requesterEmail: "student.demo@forge.local", requesterName: "Ayaan Khan", deviceNumber: "FG-LAP-001", issueType: "ACCOUNT_ACCESS", status: "OPEN", message: "Cannot access Teams link.", adminNote: null, assignedTo: null, assignedEmail: null, createdAt: addDays(-2), updatedAt: addDays(-2), resolvedAt: null, pulseSyncStatus: "SKIPPED" },
    { id: "ticket-progress", requesterEmail: "parent.demo@forge.local", requesterName: "Parent Demo", deviceNumber: null, issueType: "SOFTWARE", status: "IN_PROGRESS", message: "Need help viewing finance statement.", adminNote: "Finance team reviewing.", assignedTo: "demo-finance-admin", assignedEmail: "finance.demo@forge.local", createdAt: addDays(-4), updatedAt: addDays(-1), resolvedAt: null, pulseSyncStatus: "SKIPPED" },
    { id: "ticket-resolved", requesterEmail: "lecturer.demo@forge.local", requesterName: "Academic Staff Demo", deviceNumber: "FG-LAP-009", issueType: "NETWORK", status: "RESOLVED", message: "Lab Wi-Fi intermittent.", adminNote: "Resolved by IT.", assignedTo: "demo-super-admin", assignedEmail: "superadmin.demo@forge.local", createdAt: addDays(-8), updatedAt: addDays(-6), resolvedAt: addDays(-6), pulseSyncStatus: "SKIPPED" },
  ];
}

function learnerOnboardingRecords() {
  return [
    {
      userId: studentId,
      email: "ayaan.khan@student.forge.local",
      firstName: "Ayaan",
      lastName: "Khan",
      learnerName: "Ayaan Khan",
      studentNumber: "FA-SD-2026-001",
      courseId: "course-software-dev",
      courseCode: "SD-2026",
      courseName: "Software Development",
      externalSource: "TALENT",
      externalSourceId: "TL-2026-0001",
      activationRequired: false,
      onboardingStatus: "ACTIVATED",
      activationInvitedAt: addDays(-8),
      activatedAt: addDays(-7),
      createdAt: addDays(-10),
      updatedAt: addDays(-7),
      hasActiveActivationToken: false,
      canReissueActivation: false,
    },
    {
      userId: "demo-onboarding-pending",
      email: "naledi.mokoena@student.forge.local",
      firstName: "Naledi",
      lastName: "Mokoena",
      learnerName: "Naledi Mokoena",
      studentNumber: "FA-SD-2026-003",
      courseId: "course-software-dev",
      courseCode: "SD-2026",
      courseName: "Software Development",
      externalSource: "TALENT",
      externalSourceId: "TL-2026-0003",
      activationRequired: true,
      onboardingStatus: "PENDING_ACTIVATION",
      activationInvitedAt: null,
      activatedAt: null,
      createdAt: addDays(-3),
      updatedAt: addDays(-3),
      hasActiveActivationToken: false,
      canReissueActivation: true,
    },
    {
      userId: "demo-onboarding-invited",
      email: "liam.jacobs@student.forge.local",
      firstName: "Liam",
      lastName: "Jacobs",
      learnerName: "Liam Jacobs",
      studentNumber: "FA-SD-2026-004",
      courseId: "course-software-dev",
      courseCode: "SD-2026",
      courseName: "Software Development",
      externalSource: "CSV",
      externalSourceId: "CSV-ROW-42",
      activationRequired: true,
      onboardingStatus: "INVITED",
      activationInvitedAt: addDays(-1),
      activatedAt: null,
      createdAt: addDays(-2),
      updatedAt: addDays(-1),
      hasActiveActivationToken: true,
      canReissueActivation: true,
    },
    {
      userId: "demo-onboarding-duplicate",
      email: "duplicate.learner@student.forge.local",
      firstName: "Duplicate",
      lastName: "Learner",
      learnerName: "Duplicate Learner",
      studentNumber: null,
      courseId: null,
      courseCode: null,
      courseName: null,
      externalSource: "CSV",
      externalSourceId: "CSV-DUP-01",
      activationRequired: false,
      onboardingStatus: "DUPLICATE",
      activationInvitedAt: null,
      activatedAt: null,
      createdAt: addDays(-5),
      updatedAt: addDays(-5),
      hasActiveActivationToken: false,
      canReissueActivation: false,
    },
    {
      userId: "demo-onboarding-manual",
      email: "zara.naidoo@student.forge.local",
      firstName: "Zara",
      lastName: "Naidoo",
      learnerName: "Zara Naidoo",
      studentNumber: "FA-SD-2026-005",
      courseId: "course-software-dev",
      courseCode: "SD-2026",
      courseName: "Software Development",
      externalSource: "MANUAL",
      externalSourceId: "ADMIN-CAPTURE-17",
      activationRequired: true,
      onboardingStatus: "PENDING_ACTIVATION",
      activationInvitedAt: null,
      activatedAt: null,
      createdAt: addDays(-1),
      updatedAt: addDays(-1),
      hasActiveActivationToken: false,
      canReissueActivation: true,
    },
    {
      userId: "demo-onboarding-failed",
      email: "missing.course@student.forge.local",
      firstName: "Mila",
      lastName: "Peters",
      learnerName: "Mila Peters",
      studentNumber: null,
      courseId: null,
      courseCode: null,
      courseName: null,
      externalSource: "TALENT",
      externalSourceId: "TL-2026-0099",
      activationRequired: false,
      onboardingStatus: "FAILED",
      activationInvitedAt: null,
      activatedAt: null,
      createdAt: addDays(-4),
      updatedAt: addDays(-4),
      hasActiveActivationToken: false,
      canReissueActivation: false,
    },
  ];
}

function courseRecords(user = currentUser()) {
  return courses.map((course) => ({
    ...course,
    summary: {
      moduleCount: modules.length,
      studentCount: students.length,
      lecturerCount: 1,
      linkedModuleCount: user.role === "STUDENT" ? modules.length : 0,
    },
    modules: modules.map((m) => ({ ...m, isStudentLinked: user.role === "STUDENT" })),
    students,
  }));
}

function moduleMarksheet(moduleId: string) {
  const module = modules.find((m) => m.id === moduleId) ?? modules[0];
  const result = results.find((r) => r.moduleId === module.id) ?? results[0];
  return {
    module: {
      id: module.id,
      code: module.code,
      name: module.name,
      courseName: module.courseName,
    },
    subject: result.subject,
    date: result.date,
    value: students.map((student, index) => ({
      id: student.id,
      email: student.email,
      firstName: student.firstName,
      lastName: student.lastName,
      studentNumber: student.studentNumber,
      resultId: index === 0 ? result.id : null,
      score: index === 0 ? result.score : 68,
      outOf: 100,
      assessedAt: result.date,
    })),
    count: students.length,
  };
}

function okForMock(): boolean {
  return isMockDataMode();
}

export function getMockApiResponse<T>(request: MockRequest): T | undefined {
  if (!okForMock()) return undefined;

  const user = currentUser();
  const path = request.path.replace(/^\/api/, "");
  const method = request.method;

  if (method === "GET" && path === "/auth/me") return { user } as T;
  if (method === "GET" && path === "/channels") return value(channels) as T;
  if (method === "GET" && /^\/channels\/[^/]+\/announcements/.test(path)) {
    const channelId = path.split("/")[2] ?? "ch-general";
    return value(announcements(channelId)) as T;
  }
  if (method === "GET" && /^\/channels\/[^/]+\/messages/.test(path)) {
    const channelId = path.split("/")[2] ?? "ch-general";
    const key = channelKeyFromId(channelId);
    return value([
      { id: `msg-${key}-1`, channelId, body: "Demo staff-student thread: Please review the assessment brief.", createdBy: "lecturer.demo@forge.local", createdAt: addDays(-1) },
      { id: `msg-${key}-2`, channelId, body: "Academic staff-parent thread: Ayaan is on track for this module.", createdBy: "lecturer.demo@forge.local", createdAt: addDays(-2) },
      { id: `msg-${key}-3`, channelId, body: "Admin message: Local mock data is active for UI preview.", createdBy: "admin.demo@forge.local", createdAt: addDays(-3) },
    ]) as T;
  }
  if (method === "GET" && /^\/channels\/[^/]+\/events/.test(path)) {
    const channelId = path.split("/")[2] ?? "ch-general";
    return value([
      { id: "event-career-workshop", channelId, title: "Career workshop", description: "CV review and interview preparation", location: "Auditorium", startsAt: addDays(5, 13), endsAt: addDays(5, 15), createdBy: "admin.demo@forge.local", createdAt: isoNow },
      { id: "event-parent-review", channelId, title: "Parent academic review", description: "Progress review for Ayaan Khan", location: "Online", startsAt: addDays(7, 15), endsAt: addDays(7, 16), createdBy: "lecturer.demo@forge.local", createdAt: isoNow },
    ]) as T;
  }

  if (method === "GET" && path.startsWith("/notifications/summary")) {
    const rows = notifications(user);
    const unread = rows.filter((n) => !n.isRead);
    return {
      totalUnread: unread.length,
      counts: unread.reduce<Record<string, number>>((acc, n) => {
        acc[n.category] = (acc[n.category] ?? 0) + 1;
        return acc;
      }, {}),
    } as T;
  }
  if (method === "GET" && path.startsWith("/notifications")) {
    const rows = notifications(user);
    return { value: rows, count: rows.length, nextBefore: null } as T;
  }
  if (method === "POST" && /\/notifications\/.+\/read/.test(path)) return { ok: true } as T;
  if (method === "POST" && path === "/notifications/read-all") return { ok: true, updated: notifications(user).length } as T;

  if (method === "GET" && path.startsWith("/student/profile")) {
    return { profile: studentProfile(user), availableCourses: courses.map(({ id, code, name }) => ({ id, code, name })) } as T;
  }
  if (method === "PUT" && path.startsWith("/student/profile")) {
    return { ok: true, profile: { ...studentProfile(user), ...(isRecord(request.body) ? request.body : {}) }, availableCourses: courses.map(({ id, code, name }) => ({ id, code, name })) } as T;
  }
  if (method === "GET" && path.startsWith("/students/")) return { profile: studentProfile(user) } as T;
  if (method === "GET" && path.startsWith("/students")) return value(students) as T;
  if (method === "GET" && path.startsWith("/users/admin/accounts")) return value(users()) as T;
  if (method === "GET" && path.startsWith("/users")) return value(users()) as T;
  if (method === "GET" && path.startsWith("/admin/imports/learners")) {
    const query = new URLSearchParams(path.split("?")[1] ?? "");
    const q = String(query.get("q") ?? "").trim().toLowerCase();
    const status = String(query.get("onboardingStatus") ?? "").trim().toUpperCase();
    const source = String(query.get("source") ?? "").trim().toUpperCase();
    const activationRequired = String(query.get("activationRequired") ?? "").trim().toLowerCase();
    const rows = learnerOnboardingRecords().filter((row) => {
      if (status && String(row.onboardingStatus ?? "").toUpperCase() !== status) return false;
      if (source && String(row.externalSource ?? "").toUpperCase() !== source) return false;
      if (activationRequired === "true" && !row.activationRequired) return false;
      if (activationRequired === "false" && row.activationRequired) return false;
      if (!q) return true;
      return [
        row.learnerName,
        row.email,
        row.studentNumber,
        row.courseName,
        row.courseCode,
        row.externalSource,
        row.externalSourceId,
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
    return { value: rows, count: rows.length, total: rows.length, limit: 250, offset: 0 } as T;
  }
  if (method === "POST" && /^\/admin\/imports\/[^/]+\/send-activation/.test(path)) {
    return {
      ok: true,
      activation: {
        issued: true,
        onboardingStatus: "INVITED",
        expiresAt: addDays(2),
      },
    } as T;
  }

  if (method === "GET" && path.startsWith("/courses")) return value(courseRecords(user)) as T;
  if (method === "GET" && path.startsWith("/attendance/modules/") && path.endsWith("/students")) return value(students) as T;
  if (method === "GET" && path.startsWith("/attendance/modules")) return value(modules) as T;
  if (method === "GET" && path.startsWith("/attendance/sessions/") && path.endsWith("/roster")) {
    const sessionId = path.split("/")[3] ?? "";
    const isUpcoming = sessionId === "att-upcoming";
    const isLateSession = sessionId === "att-late";
    return value(students.map((s, index) => {
      const status = isUpcoming
        ? null
        : index === 0
          ? isLateSession
            ? "LATE"
            : "PRESENT"
          : "ABSENT";
      return {
        ...s,
        checkedInAt: status === "PRESENT" || status === "LATE" ? addDays(-1, status === "LATE" ? 9 : 8) : null,
        currentStatus: status,
        markedAt: status ? addDays(-1, 11) : null,
        suggestedStatus: status ?? "ABSENT",
      };
    })) as T;
  }
  if (method === "GET" && /^\/attendance\/sessions\/[^/]+$/.test(path)) {
    const sessionId = path.split("/")[3] ?? "";
    return { session: attendanceSessionById(sessionId) } as T;
  }
  if (method === "GET" && path.startsWith("/attendance/sessions")) return value(attendanceSessions()) as T;
  if (method === "GET" && path.startsWith("/attendance/me")) return attendanceMe() as T;

  if (method === "GET" && path.startsWith("/calendar")) return value(calendarEntries(user)) as T;
  if (method === "POST" && path === "/calendar") return { id: `cal-${Date.now()}`, ...(isRecord(request.body) ? request.body : {}), userId: user.id, createdAt: isoNow, canDelete: true, source: "CALENDAR_ENTRY" } as T;

  if (method === "GET" && path.startsWith("/uploads")) return value(uploads()) as T;
  if (method === "GET" && path === "/threads") {
    return {
      value: [
        {
          id: "thread-staff-student",
          participants: [{ email: "student.demo@forge.local" }, { email: "lecturer.demo@forge.local" }],
          lastMessageAt: addDays(-1),
        },
        {
          id: "thread-lecturer-parent",
          participants: [{ email: "parent.demo@forge.local" }, { email: "lecturer.demo@forge.local" }],
          lastMessageAt: addDays(-2),
        },
        {
          id: "thread-admin-message",
          participants: [{ email: user.email }, { email: "admin.demo@forge.local" }],
          lastMessageAt: addDays(-3),
        },
      ],
      count: 3,
      nextBefore: null,
    } as T;
  }
  if (method === "GET" && /^\/threads\/[^/]+\/messages/.test(path)) {
    const threadId = path.split("/")[2] ?? "thread-staff-student";
    return {
      value: [
        { id: `${threadId}-msg-1`, threadId, body: "Welcome to the local demo message thread.", createdBy: "demo-admin", createdAt: addDays(-2) },
        { id: `${threadId}-msg-2`, threadId, body: "This conversation is mock data for UI preview.", createdBy: user.id, createdAt: addDays(-1) },
      ],
      count: 2,
      nextBefore: null,
    } as T;
  }
  if (method === "GET" && /^\/threads\/[^/]+$/.test(path)) {
    const threadId = path.split("/")[2] ?? "thread-staff-student";
    return {
      id: threadId,
      participants: [{ email: user.email }, { email: "lecturer.demo@forge.local" }],
      lastMessageAt: addDays(-1),
    } as T;
  }
  if (method === "POST" && path === "/threads") {
    return {
      id: `thread-${Date.now()}`,
      participants: [{ email: user.email }, { email: "lecturer.demo@forge.local" }],
      lastMessageAt: isoNow,
      created: true,
    } as T;
  }
  if (method === "POST" && /^\/threads\/[^/]+\/messages/.test(path)) {
    const threadId = path.split("/")[2] ?? "thread-staff-student";
    return { id: `msg-${Date.now()}`, threadId, body: "Local demo reply", createdBy: user.id, createdAt: isoNow } as T;
  }
  if (method === "GET" && path.startsWith("/parent/children")) return value([{ ...students[0], childUserId: studentId, studentUserId: studentId, role: "STUDENT" }]) as T;
  if (method === "GET" && path.startsWith("/parent/parent/link-requests")) return value([]) as T;
  if (method === "GET" && path.startsWith("/parent/admin/parent/link-requests")) {
    return value([{ id: "link-demo-approved", status: "APPROVED", requestedAt: addDays(-6), decidedAt: addDays(-5), parentUserId: parentId, parentEmail: "parent.demo@forge.local", childUserId: studentId, childEmail: "ayaan.khan@student.forge.local", childId: "FA-SD-2026-001", southAfricanId: "0101015009087", decidedById: "demo-super-admin", decidedByEmail: "superadmin.demo@forge.local" }]) as T;
  }
  if (method === "GET" && path.startsWith("/parent/results")) return value(results) as T;
  if (method === "GET" && path.startsWith("/parent/student/results")) return value(results) as T;
  if (method === "GET" && path.startsWith("/parent/admin/results/module/")) {
    const moduleId = path.split("/")[5] ?? "mod-core-web";
    return moduleMarksheet(moduleId) as T;
  }
  if (method === "GET" && path.startsWith("/parent/admin/results")) return value(results) as T;
  if (method === "GET" && path.startsWith("/parent/finance")) return financeSummary() as T;
  if (method === "GET" && path.startsWith("/parent/attendance")) return attendanceMe().value as T;
  if (method === "GET" && path === "/parent/parent") return { ok: true, role: "PARENT", message: "Parent demo account is linked to Ayaan Khan." } as T;

  if (method === "GET" && path.startsWith("/finance/admin/accounts/")) return adminFinanceDetail() as T;
  if (method === "GET" && path.startsWith("/finance/admin/accounts")) {
    return value([
      {
        studentId,
        email: "ayaan.khan@student.forge.local",
        firstName: "Ayaan",
        lastName: "Khan",
        courseName: "Software Development",
        studentNumber: "FA-SD-2026-001",
        balance: 2850,
        currency: "ZAR",
        status: "PARTIAL",
        statusNote: "Monthly tuition partially paid",
        updatedAt: isoNow,
        parents: [{ id: parentId, email: "parent.demo@forge.local" }],
      },
    ]) as T;
  }
  if (method === "GET" && path.startsWith("/finance/summary")) return financeSummary() as T;
  if (method === "GET" && path.startsWith("/integrations/teams-links")) {
    return value([
      { key: "ADMIN", label: "Admin Teams Workspace", url: "https://teams.microsoft.com/l/team/demo-admin" },
      { key: "LECTURER", label: "Academic Staff Teams Workspace", url: "https://teams.microsoft.com/l/team/demo-lecturer" },
      { key: "STUDENT", label: "Student Teams Workspace", url: "https://teams.microsoft.com/l/team/demo-student" },
    ]) as T;
  }
  if (method === "POST" && path.startsWith("/assistant")) {
    return {
      summary: "Local demo assistant response.",
      message: "Mock mode is active, so this response is generated locally for UI preview.",
      actionIds: [],
    } as T;
  }

  if (method === "GET" && path.startsWith("/support/admin/tickets")) return value(supportTickets()) as T;
  if (method === "GET" && path.startsWith("/support/tickets")) return value(supportTickets()) as T;
  if (method === "POST" && path === "/support/tickets") {
    return { ok: true, ticket: supportTickets()[0], message: "Demo ticket captured locally.", pulseSyncStatus: "SKIPPED" } as T;
  }

  if (["POST", "PATCH", "DELETE", "PUT"].includes(method)) {
    return { ok: true } as T;
  }

  return undefined;
}
