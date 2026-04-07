import type { AdminScope, UserRole } from "./auth";
import { getUser } from "./auth";
import { apiClient } from "./apiClient";
import { isMockAuthEnabled } from "./devMode";
import {
  fetchMockMeProfile,
  loginWithMockAuth,
  registerWithMockAuth,
  requestMockOtp,
  resolveMockUserFromToken,
} from "./mockAuth";

export type AuthUserDTO = {
  id: string;
  email: string;
  role: UserRole;
  adminScope?: AdminScope | null;
  firstName?: string | null;
  lastName?: string | null;
  courseName?: string | null;
};

export type LoginResponse = { token: string; user?: AuthUserDTO };
export type RegisterResponse = { token?: string; user?: AuthUserDTO; message?: string };
export type OtpResponse = {
  ok: boolean;
  expiresAt?: string;
  devOtp?: string;
  devCode?: string;
  debugOtp?: string;
};

export type MeProfile = {
  id: string;
  email: string;
  role: UserRole;
  adminScope?: AdminScope | null;
  firstName: string;
  lastName: string;
  courseName: string | null;
};

type RequestOtpInput = { email: string; purpose: "LOGIN" | "REGISTER" };
type LoginInput = { email: string; password: string; otp?: string; studentNumber?: string };
type RegisterInput = {
  email: string;
  password: string;
  role: UserRole;
  otp: string;
  acceptedLegalTerms: boolean;
  staffRegisterPassword?: string;
  studentNumber?: string;
  southAfricanId?: string;
};

export async function requestOtp(input: RequestOtpInput): Promise<OtpResponse> {
  if (isMockAuthEnabled()) {
    return requestMockOtp();
  }
  return apiClient.post<OtpResponse>("/auth/request-otp", input, { auth: false });
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  if (isMockAuthEnabled()) {
    return loginWithMockAuth(input);
  }
  return apiClient.post<LoginResponse>("/auth/login", input, { auth: false });
}

export async function register(input: RegisterInput): Promise<RegisterResponse> {
  if (isMockAuthEnabled()) {
    return registerWithMockAuth(input);
  }
  return apiClient.post<RegisterResponse>("/auth/register", input, { auth: false });
}

export async function fetchAuthMe(token: string): Promise<AuthUserDTO> {
  if (isMockAuthEnabled()) {
    const user = resolveMockUserFromToken(token);
    if (!user) throw new Error("Invalid mock session.");
    return user;
  }
  return apiClient.get<{ user: AuthUserDTO }>("/auth/me", {
    auth: false,
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.user);
}

export async function fetchMeProfile(): Promise<MeProfile> {
  if (isMockAuthEnabled()) {
    return fetchMockMeProfile(getUser());
  }
  return apiClient.get<MeProfile>("/me");
}
