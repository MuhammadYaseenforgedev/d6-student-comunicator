import type { AuthUser, UserRole } from "./auth";
import type {
  AuthUserDTO,
  LoginResponse,
  MeProfile,
  OtpResponse,
  RegisterResponse,
} from "./authService";

const TOKEN_PREFIX = "mock-token:";

type MockUserRecord = AuthUserDTO & {
  password: string;
  studentNumber?: string;
  southAfricanId?: string;
};

const DEMO_USERS: MockUserRecord[] = [
  {
    id: "mock-student-1",
    email: "student@localhost.test",
    password: "Demo123!",
    role: "STUDENT",
    firstName: "Naledi",
    lastName: "Mokoena",
    courseName: "Diploma in Information Technology",
    studentNumber: "STU-1001",
    southAfricanId: "0012311234088",
  },
  {
    id: "mock-lecturer-1",
    email: "lecturer@localhost.test",
    password: "Demo123!",
    role: "LECTURER",
    firstName: "Thabo",
    lastName: "Ndlovu",
    courseName: "Faculty of Computing",
  },
  {
    id: "mock-admin-1",
    email: "admin@localhost.test",
    password: "Demo123!",
    role: "ADMIN",
    adminScope: "SUPER",
    firstName: "Aisha",
    lastName: "Daniels",
    courseName: "Operations",
  },
  {
    id: "mock-parent-1",
    email: "parent@localhost.test",
    password: "Demo123!",
    role: "PARENT",
    firstName: "Lerato",
    lastName: "Mokoena",
  },
];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function toAuthUserDTO(user: MockUserRecord): AuthUserDTO {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    adminScope: user.adminScope ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    courseName: user.courseName ?? null,
  };
}

function toMeProfile(user: MockUserRecord): MeProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    adminScope: user.adminScope ?? null,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    courseName: user.courseName ?? null,
  };
}

function findDemoUserByEmail(email: string): MockUserRecord | undefined {
  const normalizedEmail = normalizeEmail(email);
  return DEMO_USERS.find((user) => user.email === normalizedEmail);
}

export function createMockToken(user: Pick<AuthUserDTO, "id">): string {
  return `${TOKEN_PREFIX}${user.id}`;
}

export function resolveMockUserFromToken(token: string): AuthUserDTO | null {
  const rawId = String(token ?? "").trim();
  if (!rawId.startsWith(TOKEN_PREFIX)) return null;

  const id = rawId.slice(TOKEN_PREFIX.length);
  const user = DEMO_USERS.find((item) => item.id === id);
  return user ? toAuthUserDTO(user) : null;
}

export function requestMockOtp(): OtpResponse {
  return {
    ok: true,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    devOtp: "000000",
  };
}

export function loginWithMockAuth(input: {
  email: string;
  password: string;
  studentNumber?: string;
}): LoginResponse {
  const user = findDemoUserByEmail(input.email);
  if (!user || user.password !== input.password) {
    throw new Error("Invalid demo credentials.");
  }

  if (user.role === "STUDENT") {
    const studentNumber = String(input.studentNumber ?? "").trim().toUpperCase();
    if (studentNumber && studentNumber !== user.studentNumber) {
      throw new Error("Invalid student number for the demo student.");
    }
  }

  return {
    token: createMockToken(user),
    user: toAuthUserDTO(user),
  };
}

export function registerWithMockAuth(input: {
  email: string;
  password: string;
  role: UserRole;
  acceptedLegalTerms: boolean;
}): RegisterResponse {
  const existing = findDemoUserByEmail(input.email);
  if (existing) {
    return {
      token: createMockToken(existing),
      user: toAuthUserDTO(existing),
      message: "Using existing demo account.",
    };
  }

  const created: MockUserRecord = {
    id: `mock-${input.role.toLowerCase()}-${Date.now()}`,
    email: normalizeEmail(input.email),
    password: input.password,
    role: input.role,
    adminScope: input.role === "ADMIN" ? "SUPER" : null,
    firstName: "Demo",
    lastName: input.role.charAt(0) + input.role.slice(1).toLowerCase(),
    courseName:
      input.role === "STUDENT" ? "Diploma in Information Technology" : null,
    studentNumber:
      input.role === "STUDENT" ? `STU-${String(Date.now()).slice(-4)}` : undefined,
  };

  DEMO_USERS.push(created);

  return {
    token: createMockToken(created),
    user: toAuthUserDTO(created),
    message: "Demo account created.",
  };
}

export function fetchMockMeProfile(user: AuthUser | null): MeProfile {
  const source = user ? findDemoUserByEmail(user.email) : undefined;
  const resolved =
    source ??
    ({
      id: user?.id ?? "mock-user",
      email: user?.email ?? "demo@local.test",
      password: "",
      role: user?.role ?? "STUDENT",
      adminScope: user?.adminScope ?? null,
      firstName: user?.firstName ?? "Demo",
      lastName: user?.lastName ?? "User",
      courseName: user?.courseName ?? null,
    } satisfies MockUserRecord);

  return toMeProfile(resolved);
}
