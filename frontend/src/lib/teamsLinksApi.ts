import { apiClient } from "./apiClient";

export type TeamsLinkRole = "ADMIN" | "LECTURER" | "STUDENT";

export type TeamsLink = {
  key: TeamsLinkRole;
  label: string;
  url: string;
};

type TeamsLinksResponse = {
  value: TeamsLink[];
  count: number;
};

export async function fetchTeamsLinks(): Promise<TeamsLinksResponse> {
  return apiClient.get<TeamsLinksResponse>("/integrations/teams-links");
}
