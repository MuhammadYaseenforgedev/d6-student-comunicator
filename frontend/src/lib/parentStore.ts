const KEY = "demo_parent_links_v1";

type ParentLinks = Record<string, string[]>;

function normEmail(value: string) {
  return value.trim().toLowerCase();
}

function load(): ParentLinks {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ParentLinks;
  } catch {
    return {};
  }
}

function save(data: ParentLinks) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getLinkedChildren(parentEmail: string): string[] {
  const p = normEmail(parentEmail);
  const data = load();
  return data[p] ?? [];
}

export function linkChildToParent(parentEmail: string, childEmail: string): string[] {
  const p = normEmail(parentEmail);
  const c = normEmail(childEmail);
  if (!c) return getLinkedChildren(p);

  const data = load();
  const current = data[p] ?? [];

  const next = current.includes(c) ? current : [...current, c];
  data[p] = next;
  save(data);

  return next;
}

export function unlinkChildFromParent(parentEmail: string, childEmail: string): string[] {
  const p = normEmail(parentEmail);
  const c = normEmail(childEmail);

  const data = load();
  const current = data[p] ?? [];

  const next = current.filter((x) => x !== c);
  data[p] = next;
  save(data);

  return next;
}

export function resetParentLinksDemo() {
  localStorage.removeItem(KEY);
}
