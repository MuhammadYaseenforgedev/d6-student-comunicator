import { Router } from "express";
import { requireAuth } from "../middleware/auth";

type Role = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
type TeamsRole = Exclude<Role, "PARENT">;

type TeamsLink = {
  key: TeamsRole;
  label: string;
  url: string;
};

const teamsLinksRouter = Router();
teamsLinksRouter.use(requireAuth);

const ROLE_LINK_CONFIG: Record<TeamsRole, { envName: string; label: string }> = {
  ADMIN: { envName: "TEAMS_LINK_ADMIN", label: "Open Staff Teams" },
  LECTURER: { envName: "TEAMS_LINK_LECTURER", label: "Open Lecturer Workspace" },
  STUDENT: { envName: "TEAMS_LINK_STUDENT", label: "Open Class Teams" },
};
const DEFAULT_TEAMS_URL = "https://teams.microsoft.com/";

function toRole(v: unknown): Role | null {
  const role = String(v ?? "").trim().toUpperCase();
  if (role === "ADMIN" || role === "LECTURER" || role === "STUDENT" || role === "PARENT") {
    return role;
  }
  return null;
}

function readTeamsLink(name: string): string | null {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return DEFAULT_TEAMS_URL;

  // Keep this strict for safety: only HTTP(S) and Teams URI links are allowed.
  if (raw.startsWith("https://") || raw.startsWith("http://") || raw.startsWith("msteams://")) {
    return raw;
  }

  return DEFAULT_TEAMS_URL;
}

teamsLinksRouter.get("/teams-links", (req, res) => {
  const role = toRole(req.user!.role);
  if (!role) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Invalid role" } });
  }

  if (role === "PARENT") {
    return res.json({ value: [] as TeamsLink[], count: 0 });
  }

  const config = ROLE_LINK_CONFIG[role];
  const link = readTeamsLink(config.envName);
  if (!link) {
    return res.json({ value: [] as TeamsLink[], count: 0 });
  }

  const value: TeamsLink[] = [{ key: role, label: config.label, url: link }];
  return res.json({ value, count: value.length });
});

export { teamsLinksRouter };
