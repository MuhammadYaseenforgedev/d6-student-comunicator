type FrontendEnv = {
  VITE_USE_MOCK_AUTH?: string;
  VITE_DATA_MODE?: string;
};

const env = (import.meta as unknown as { env: FrontendEnv }).env;

function isTruthy(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}

export function isMockAuthEnabled(): boolean {
  return isTruthy(env?.VITE_USE_MOCK_AUTH);
}

export function isMockDataEnabled(): boolean {
  const mode = String(env?.VITE_DATA_MODE ?? "").trim().toLowerCase();
  if (mode === "mock") return true;
  return isMockAuthEnabled();
}

