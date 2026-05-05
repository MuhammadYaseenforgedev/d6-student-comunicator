import { setAuth, type AdminScope, type AuthUser, type UserRole } from "./auth";

type DemoEnv = {
  DEV?: boolean;
  VITE_DATA_MODE?: string;
  VITE_ENABLE_DEMO_LOGIN?: string;
};

export type DemoAccount = {
  key: string;
  label: string;
  user: AuthUser;
};

const env = (import.meta as unknown as { env: DemoEnv }).env;

function enabledFlag(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function isMockDataMode(): boolean {
  const mode = String(env?.VITE_DATA_MODE ?? "").trim().toLowerCase();
  return mode === "mock" || mode === "demo";
}

export function isDemoLoginEnabled(): boolean {
  return (
    enabledFlag(env?.VITE_ENABLE_DEMO_LOGIN) &&
    (isMockDataMode() || Boolean(env?.DEV))
  );
}

function adminUser(
  key: string,
  label: string,
  adminScope: AdminScope,
  email: string,
  firstName: string
): DemoAccount {
  return {
    key,
    label,
    user: {
      id: `demo-${key}`,
      email,
      role: "ADMIN",
      adminScope,
      firstName,
      lastName: "Demo",
    },
  };
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  adminUser("super-admin", "Login as Super Admin", "SUPER", "superadmin.demo@forge.local", "Super Admin"),
  adminUser("admin", "Login as Admin", "SUPER", "admin.demo@forge.local", "Admin"),
  adminUser("finance-admin", "Login as Finance Admin", "FINANCE", "finance.demo@forge.local", "Finance Admin"),
  adminUser("academic-admin", "Login as Academic Admin", "ACADEMIC", "academic.demo@forge.local", "Academic Admin"),
  {
    key: "lecturer",
    label: "Login as Lecturer",
    user: {
      id: "demo-lecturer",
      email: "lecturer.demo@forge.local",
      role: "LECTURER",
      firstName: "Lecturer",
      lastName: "Demo",
    },
  },
  {
    key: "student",
    label: "Login as Student",
    user: {
      id: "demo-student",
      email: "student.demo@forge.local",
      role: "STUDENT",
      campusId: "FA-SD-2026-001",
      firstName: "Ayaan",
      lastName: "Khan",
      courseName: "Software Development",
    },
  },
  {
    key: "parent",
    label: "Login as Parent",
    user: {
      id: "demo-parent",
      email: "parent.demo@forge.local",
      role: "PARENT",
      firstName: "Parent",
      lastName: "Demo",
    },
  },
];

export function createDemoToken(account: DemoAccount): string {
  const payload = {
    sub: account.user.id,
    email: account.user.email,
    role: account.user.role,
    adminScope: account.user.adminScope ?? null,
    localDemo: true,
    iat: Math.floor(Date.now() / 1000),
  };
  return `local-demo.${btoa(JSON.stringify(payload))}.${Date.now()}`;
}

export function loginWithDemoAccount(account: DemoAccount): { token: string; user: AuthUser } {
  if (!isDemoLoginEnabled()) {
    throw new Error("Local demo login is disabled.");
  }

  const token = createDemoToken(account);
  setAuth(token, account.user);
  return { token, user: account.user };
}

export function demoAccountForUser(user: Pick<AuthUser, "role" | "adminScope"> | null | undefined) {
  if (!user) return null;
  if (user.role !== "ADMIN") {
    return DEMO_ACCOUNTS.find((account) => account.user.role === user.role) ?? null;
  }
  const scope = user.adminScope ?? "SUPER";
  return DEMO_ACCOUNTS.find((account) => account.user.role === "ADMIN" && account.user.adminScope === scope) ?? null;
}

export type { AdminScope, AuthUser, UserRole };
