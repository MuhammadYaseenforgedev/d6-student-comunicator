import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AssistantWidget, {
  type AssistantAction,
  type AssistantReply,
} from "./AssistantWidget";
import { askAppAssistant } from "../lib/assistantApi";
import {
  answerAppQuestion,
  getAssistantDestinations,
  getCurrentAssistantContext,
  getRoleAssistantProfile,
} from "../lib/assistantKnowledge";
import type { AuthUser } from "../lib/auth";

type RoleAssistantProps = {
  user: AuthUser;
};

export default function RoleAssistant({ user }: RoleAssistantProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const profile = useMemo(() => getRoleAssistantProfile(user), [user]);
  const destinations = useMemo(() => getAssistantDestinations(user), [user]);
  const context = useMemo(
    () => getCurrentAssistantContext(user, location.pathname),
    [location.pathname, user]
  );

  const actionFor = useCallback(
    (actionId: string): AssistantAction => {
      const destination = destinations.find((entry) => entry.id === actionId);

      if (!destination) {
        return {
          id: actionId,
          label: "Back home",
          run: () => {
            navigate(destinations[0]?.path ?? "/app");
            return "Taking you to the main workspace.";
          },
        };
      }

      return {
        id: destination.id,
        label: destination.label,
        run: () => {
          if (location.pathname === destination.path) {
            return `You are already on ${destination.label}.`;
          }

          navigate(destination.path);
          return `Opening ${destination.label}.`;
        },
      };
    },
    [destinations, location.pathname, navigate]
  );

  const welcome = useMemo<AssistantReply>(
    () => ({ text: profile.welcome }),
    [profile.welcome]
  );

  const spotlightActions = useMemo(
    () => context.actionIds.map(actionFor),
    [context.actionIds, actionFor]
  );

  return (
    <AssistantWidget
      name={profile.name}
      subtitle={profile.subtitle}
      placeholder={profile.placeholder}
      welcome={welcome}
      resetKey={profile.key}
      contextTitle={context.title}
      contextSummary={context.summary}
      spotlightActions={spotlightActions}
      onAsk={async (input, history) => {
        const answer = answerAppQuestion(user, location.pathname, input);
        const actions = (answer.actionIds ?? []).map(actionFor);

        try {
          const reply = await askAppAssistant({
            message: input,
            history,
            pathname: location.pathname,
            assistantName: profile.name,
            assistantSubtitle: profile.subtitle,
            contextTitle: context.title,
            contextSummary: context.summary,
            overview: profile.overview,
            destinations,
          });

          return {
            text: reply.text,
            actions,
          };
        } catch {
          return {
            text: answer.text,
            actions,
          };
        }
      }}
    />
  );
}
