export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(value: unknown): string | null {
  const password = String(value ?? "");

  if (!password.trim()) {
    return "password cannot be empty";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return null;
}
