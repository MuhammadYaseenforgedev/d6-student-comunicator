import { useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AssistantWidget, {
  type AssistantAction,
  type AssistantChatMessage,
  type AssistantReply,
} from "./AssistantWidget";
import { askAppAssistant } from "../lib/assistantApi";
import { getAssistantCapabilityFallback, getAssistantLiveReply } from "../lib/assistantLiveData";
import {
  type AssistantWorkflowAnswer,
  answerAppQuestion,
  getAssistantDestinations,
  getAssistantNavigationAnswer,
  getAssistantPartialUnderstandingAnswer,
  getAssistantUnsupportedActionAnswer,
  getAssistantWorkflowAnswer,
  getCurrentAssistantContext,
  getRoleAssistantProfile,
  isAssistantWorkflowFollowUp,
  type AssistantDestinationId,
} from "../lib/assistantKnowledge";
import type { AuthUser } from "../lib/auth";

type RoleAssistantProps = {
  user: AuthUser;
};

type WorkflowReplyState = {
  actionIds: AssistantDestinationId[];
  followUpText?: string;
  followUpActionIds: AssistantDestinationId[];
};

export default function RoleAssistant({ user }: RoleAssistantProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const lastReplyActionIdsRef = useRef<AssistantDestinationId[]>([]);
  const lastWorkflowStateRef = useRef<WorkflowReplyState | null>(null);

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

  const rememberActionIds = useCallback((actionIds?: AssistantDestinationId[]) => {
    lastReplyActionIdsRef.current = Array.from(
      new Set(
        (actionIds ?? []).filter((actionId): actionId is AssistantDestinationId =>
          destinations.some((entry) => entry.id === actionId)
        )
      )
    );
  }, [destinations]);

  const rememberWorkflowState = useCallback(
    (answer?: AssistantWorkflowAnswer | null) => {
      if (!answer?.actionIds?.length) {
        lastWorkflowStateRef.current = null;
        return;
      }

      lastWorkflowStateRef.current = {
        actionIds: answer.actionIds,
        followUpText: answer.followUpText,
        followUpActionIds: answer.followUpActionIds ?? [],
      };
    },
    []
  );

  const clearWorkflowState = useCallback(() => {
    lastWorkflowStateRef.current = null;
  }, []);

  const resolveWorkflowFollowUpReply = useCallback(
    (input: string): AssistantReply | null => {
      if (!isAssistantWorkflowFollowUp(input)) {
        return null;
      }

      const workflowState = lastWorkflowStateRef.current;
      if (!workflowState) {
        return null;
      }

      const actionIds =
        workflowState.followUpActionIds.length > 0
          ? workflowState.followUpActionIds
          : workflowState.actionIds;

      if (actionIds.length === 0) {
        return {
          text:
            workflowState.followUpText ??
            "Start with the page I mentioned, then follow the steps there.",
        };
      }

      return {
        text:
          workflowState.followUpText ??
          "Start with the page below, then continue from there.",
        actions: actionIds.map(actionFor),
      };
    },
    [actionFor]
  );

  const resolveReferenceNavigationReply = useCallback(
    (
      input: string,
      history: Array<Pick<AssistantChatMessage, "role" | "text">>
    ): AssistantReply | null => {
      const query = input.trim().toLowerCase();
      const isReferenceNavigation =
        [
          "open that page",
          "open that",
          "take me there",
          "go there",
          "show me that",
          "show me that page",
          "show me the page",
          "show the page",
          "show it",
          "open there",
          "open it",
          "open the first one",
          "the first one",
        ].some((phrase) => query.includes(phrase));

      if (!isReferenceNavigation) {
        return null;
      }

      const recentActionIds = lastReplyActionIdsRef.current;
      if (query.includes("first one") && recentActionIds.length > 0) {
        const firstActionId = recentActionIds[0];
        return {
          text: `I can open ${destinations.find((entry) => entry.id === firstActionId)?.label ?? "that page"} for you.`,
          actions: [actionFor(firstActionId)],
        };
      }

      if (recentActionIds.length === 1) {
        const actionId = recentActionIds[0];
        return {
          text: `I can open ${destinations.find((entry) => entry.id === actionId)?.label ?? "that page"} for you.`,
          actions: [actionFor(actionId)],
        };
      }

      if (recentActionIds.length > 1) {
        return {
          text: "I mentioned a few pages. Which one do you want to open?",
          actions: recentActionIds.slice(0, 3).map(actionFor),
        };
      }

      const recentAssistantMention = [...history]
        .reverse()
        .find((turn) => turn.role === "assistant" && /page|open|results|attendance|calendar|finance|accounts/i.test(turn.text));

      if (!recentAssistantMention) {
        return null;
      }

      return {
        text: "I need a clearer page reference before I open anything. Try naming the page directly.",
      };
    },
    [actionFor, destinations]
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
        const referenceNavigationReply = resolveReferenceNavigationReply(input, history);
        if (referenceNavigationReply) {
          rememberActionIds(
            referenceNavigationReply.actions?.map((action) => action.id as AssistantDestinationId)
          );
          return referenceNavigationReply;
        }

        const workflowFollowUpReply = resolveWorkflowFollowUpReply(input);
        if (workflowFollowUpReply) {
          rememberActionIds(
            workflowFollowUpReply.actions?.map((action) => action.id as AssistantDestinationId)
          );
          return workflowFollowUpReply;
        }

        const workflowAnswer = getAssistantWorkflowAnswer(user, input);
        if (workflowAnswer) {
          const workflowActionIds = workflowAnswer.actionIds ?? [];
          rememberActionIds(workflowActionIds);
          rememberWorkflowState(workflowAnswer);
          return {
            text: workflowAnswer.text,
            actions: workflowActionIds.map(actionFor),
          };
        }

        const navigationAnswer = getAssistantNavigationAnswer(user, input);
        if (navigationAnswer?.actionIds?.length) {
          clearWorkflowState();
          rememberActionIds(navigationAnswer.actionIds);
          return {
            text: navigationAnswer.text,
            actions: navigationAnswer.actionIds.map(actionFor),
          };
        }

        const unsupportedActionAnswer = getAssistantUnsupportedActionAnswer(user, input);
        if (unsupportedActionAnswer?.actionIds?.length) {
          clearWorkflowState();
          rememberActionIds(unsupportedActionAnswer.actionIds);
          return {
            text: unsupportedActionAnswer.text,
            actions: unsupportedActionAnswer.actionIds.map(actionFor),
          };
        }

        const liveReply = await getAssistantLiveReply(user, input, history);
        if (liveReply) {
          clearWorkflowState();
          const actionIds = liveReply.actionIds ?? [];
          rememberActionIds(actionIds);
          const actions = actionIds.map(actionFor);
          return {
            text: liveReply.text,
            actions,
          };
        }

        const partialUnderstandingAnswer = getAssistantPartialUnderstandingAnswer(user, input);
        if (partialUnderstandingAnswer?.actionIds?.length) {
          clearWorkflowState();
          rememberActionIds(partialUnderstandingAnswer.actionIds);
          return {
            text: partialUnderstandingAnswer.text,
            actions: partialUnderstandingAnswer.actionIds.map(actionFor),
          };
        }

        clearWorkflowState();
        const answer = answerAppQuestion(user, location.pathname, input);

        const answerActionIds = answer.actionIds ?? [];
        rememberActionIds(answerActionIds);
        const actions = answerActionIds.map(actionFor);

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

          rememberActionIds(answerActionIds);
          return {
            text: reply.text,
            actions,
          };
        } catch {
          if (!answer.actionIds?.length) {
            const fallback = getAssistantCapabilityFallback(user);
            const fallbackActionIds = fallback.actionIds ?? [];
            rememberActionIds(fallbackActionIds);
            return {
              text: fallback.text,
              actions: fallbackActionIds.map(actionFor),
            };
          }

          rememberActionIds(answerActionIds);
          return {
            text: answer.text,
            actions,
          };
        }
      }}
    />
  );
}
