import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AssistantWidget, {
  type AssistantAction,
  type AssistantReply,
} from "./AssistantWidget";
import { askAuthAssistant } from "../lib/assistantApi";
import {
  answerAuthQuestion,
  getAuthAssistantProfile,
  getAuthContext,
  getDefaultAuthActionIds,
  type AuthActionId,
  type AuthMode,
} from "../lib/assistantKnowledge";
import type { UserRole } from "../lib/auth";

type AuthAssistantProps = {
  mode: AuthMode;
  role: UserRole;
  canRequestOtp: boolean;
  onSwitchMode: (mode: AuthMode) => void;
  onRequestOtp: () => Promise<void>;
};

export default function AuthAssistant({
  mode,
  role,
  canRequestOtp,
  onSwitchMode,
  onRequestOtp,
}: AuthAssistantProps) {
  const navigate = useNavigate();

  const profile = useMemo(
    () => getAuthAssistantProfile(mode, role),
    [mode, role]
  );
  const context = useMemo(() => getAuthContext(mode, role), [mode, role]);

  const actionFor = useCallback(
    (actionId: AuthActionId): AssistantAction => {
      switch (actionId) {
        case "switch-login":
          return {
            id: actionId,
            label: "Login tab",
            run: () => {
              onSwitchMode("login");
              return "Switched to Login. Enter email and password first, then use OTP if your environment requires it.";
            },
          };

        case "switch-register":
          return {
            id: actionId,
            label: "Register tab",
            run: () => {
              onSwitchMode("register");
              return "Switched to Register. Pick the right role and I will keep the guidance aligned with the form.";
            },
          };

        case "request-otp":
          return {
            id: actionId,
            label: "Request OTP",
            run: async () => {
              if (!canRequestOtp) {
                return "Enter your email first, then I can help you request OTP.";
              }

              await onRequestOtp();

              return mode === "login"
                ? "OTP requested for login. Check the info banner and your email or backend console."
                : "OTP requested for registration. Check the info banner and your email or backend console.";
            },
          };

        case "student-fields":
          return {
            id: actionId,
            label: "Student fields",
            run: () =>
              mode === "login"
                ? "Students sign in with email, password, and OTP when required. Student number remains an internal reference after login."
                : "Student registration needs South African ID, email, password, confirm password, and OTP. The student number is generated after registration.",
          };

        case "staff-password":
          return {
            id: actionId,
            label: "Staff password",
            run: () =>
              "Lecturer and Admin registration needs the shared staff registration password before the account can be created.",
          };

        case "parent-setup":
          return {
            id: actionId,
            label: "Parent setup",
            run: () =>
              "Parent registration needs email, password, confirm password, and OTP only. Parents do not enter student number, South African ID, or staff password.",
          };

        case "support":
          return {
            id: actionId,
            label: "Support desk",
            run: () => {
              navigate("/support");
              return "Opening Support so you can send a ticket if the form still blocks you.";
            },
          };
      }
    },
    [canRequestOtp, mode, navigate, onRequestOtp, onSwitchMode]
  );

  const welcome = useMemo<AssistantReply>(
    () => ({ text: profile.welcome }),
    [profile.welcome]
  );

  const spotlightActions = useMemo(
    () => getDefaultAuthActionIds(mode, role).map(actionFor),
    [mode, role, actionFor]
  );

  function describeAction(actionId: AuthActionId): string {
    switch (actionId) {
      case "switch-login":
        return "Switch to the login tab for an existing account.";
      case "switch-register":
        return "Switch to the registration tab to create a new account.";
      case "request-otp":
        return canRequestOtp
          ? "Request a one-time password code for the current form."
          : "OTP becomes available after the user enters their email address.";
      case "student-fields":
        return mode === "login"
          ? "Explain student sign-in with email and OTP."
          : "Explain the South African ID field and generated student number during student registration.";
      case "staff-password":
        return "Explain the shared staff registration password for lecturer and admin sign-up.";
      case "parent-setup":
        return "Explain parent-specific registration fields and next steps.";
      case "support":
        return "Open the support desk when the user is blocked.";
    }
  }

  return (
    <AssistantWidget
      name={profile.name}
      subtitle={profile.subtitle}
      placeholder={profile.placeholder}
      welcome={welcome}
      resetKey={`${mode}:${role}`}
      contextTitle={context.title}
      contextSummary={context.summary}
      spotlightActions={spotlightActions}
      onAsk={async (input, history) => {
        const answer = answerAuthQuestion(mode, role, input);
        const actions = (answer.actionIds ?? []).map(actionFor);

        try {
          const reply = await askAuthAssistant({
            message: input,
            history,
            mode,
            role,
            canRequestOtp,
            assistantName: profile.name,
            assistantSubtitle: profile.subtitle,
            contextTitle: context.title,
            contextSummary: context.summary,
            quickActions: getDefaultAuthActionIds(mode, role).map((actionId) => ({
              id: actionId,
              label: actionFor(actionId).label,
              description: describeAction(actionId),
            })),
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
