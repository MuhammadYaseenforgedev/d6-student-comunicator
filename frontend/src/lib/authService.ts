import type { AdminScope, UserRole } from "./auth";
import { apiClient } from "./apiClient";

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
  emailDeliveryEnabled?: boolean;
};

export type MeProfile = {
  id: string;
  email: string;
  role: UserRole;
  adminScope?: AdminScope | null;
  firstName: string;
  lastName: string;
  courseName: string | null;
  studentNumber?: string | null;
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
  return apiClient.post<OtpResponse>("/auth/request-otp", input, { auth: false });
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/login", input, { auth: false });
}

export async function register(input: RegisterInput): Promise<RegisterResponse> {
  return apiClient.post<RegisterResponse>("/auth/register", input, { auth: false });
}

export async function fetchAuthMe(token: string): Promise<AuthUserDTO> {
  return apiClient.get<{ user: AuthUserDTO }>("/auth/me", {
    auth: false,
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.user);
}

export async function fetchMeProfile(): Promise<MeProfile> {
  return apiClient.get<MeProfile>("/me");
}
