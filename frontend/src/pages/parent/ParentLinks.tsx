// src/pages/parent/ParentLinks.tsx
import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { getUser } from "../../lib/auth";
import { linkChild, listMyChildren, type ParentChild } from "../../api/parent";
import { toInlineError } from "./errorText";

function childStudentLabel(child: ParentChild): string {
  const id = child.publicStudentId ?? child.studentNumber;
  return typeof id === "string" && id.trim() ? id.trim() : "Not set";
}

export default function ParentLinks() {
  const user = getUser();
  const parentEmail = user?.email?.trim().toLowerCase() || "not available";

  const [identifier, setIdentifier] = useState("");
  const [linking, setLinking] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [children, setChildren] = useState<ParentChild[]>([]);

  async function loadChildren() {
    setLoadingChildren(true);
    try {
      const rows = await listMyChildren();
      setChildren(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(toInlineError(e, "Failed to load linked children"));
    } finally {
      setLoadingChildren(false);
    }
  }

  useEffect(() => {
    void loadChildren();
  }, []);

  async function onLinkChild() {
    setError(null);
    setSuccess(null);

    const cleaned = identifier.trim();
    if (!cleaned) {
      setError("Enter a student number or public student ID such as FA-20260001.");
      return;
    }

    setLinking(true);
    try {
      const result = await linkChild(cleaned);
      setIdentifier("");

      if (result.pending) {
        setSuccess(
          result.message || `Link request submitted for ${cleaned}. Await admin approval.`
        );
      } else if (result.child) {
        setSuccess(`Linked ${result.child.email}.`);
      } else if (result.message) {
        setSuccess(result.message);
      } else {
        setSuccess("Child link processed.");
      }

      await loadChildren();
    } catch (e) {
      setError(toInlineError(e, "Failed to link child"));
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Children"
        subtitle="Link a child and view your linked children."
      />

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Link a child</div>
        <div className="mt-1 text-sm text-white/72">
          Enter student number or public student ID. South African ID is also supported.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="FA-20260001"
            className="input-glass"
            aria-label="Student identifier"
            title="Student identifier"
          />

          <button
            type="button"
            onClick={() => {
              void onLinkChild();
            }}
            disabled={linking}
            className="btn-primary px-5 py-3 font-semibold disabled:opacity-60"
          >
            {linking ? "Linking..." : "Link child"}
          </button>
        </div>

        {error && <div className="error-banner mt-4 p-3 text-sm">{error}</div>}
        {success && <div className="info-banner mt-4 p-3 text-sm">{success}</div>}

        <div className="mt-3 text-xs text-white/55">
          Signed in as: <span className="text-white">{parentEmail}</span>
        </div>
      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Linked children</div>
        <div className="mt-1 text-sm text-white/72">
          These children are available in Calendar, Results, and Finance.
        </div>

        <div className="mt-4 space-y-3">
          {loadingChildren ? (
            <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-5 text-white/80">
              Loading linked children...
            </div>
          ) : children.length === 0 ? (
            <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-5 text-white/80">
              No linked children. Link a child first.
            </div>
          ) : (
            children.map((child) => (
              <div
                key={child.id}
                className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 shadow-[0_0_18px_rgba(140,235,255,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">{child.email}</div>
                    <div className="mt-1 text-xs text-white/65">Role: {child.role}</div>
                    <div className="mt-1 text-xs text-white/55">
                      Student Number: {childStudentLabel(child)}
                    </div>
                  </div>

                  <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    LINKED
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
