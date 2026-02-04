const KEY = "dev_bypass";

export function setDevBypass(value: boolean) {
  if (value) localStorage.setItem(KEY, "true");
  else localStorage.removeItem(KEY);
}

export function hasDevBypass() {
  return localStorage.getItem(KEY) === "true";
}
