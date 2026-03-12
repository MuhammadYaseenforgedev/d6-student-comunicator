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
      setError("Enter a student number/public student ID (for example: STU-1001).");
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

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Link a child</div>
        <div className="mt-1 text-sm text-slate-600">
          Enter student number/public student ID (for example: STU-1001). South African ID is also supported.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="STU-1001"
            className="w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          Signed in as: <span className="text-slate-900">{parentEmail}</span>
        </div>
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Linked children</div>
        <div className="mt-1 text-sm text-slate-600">
          These children are available in Calendar, Results, and Finance.
        </div>

        <div className="mt-4 space-y-3">
          {loadingChildren ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-5 text-slate-700">
              Loading linked children...
            </div>
          ) : children.length === 0 ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-5 text-slate-700">
              No linked children. Link a child first.
            </div>
          ) : (
            children.map((child) => (
              <div
                key={child.id}
                className="rounded-2xl border border-[#e2d8ff] bg-white p-4 shadow-[0_8px_20px_rgba(121,77,250,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#cbb8ff]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{child.email}</div>
                    <div className="mt-1 text-xs text-slate-600">Role: {child.role}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Student Number: {childStudentLabel(child)}
                    </div>
                  </div>

                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
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