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
        setSuccess(result.message || `Link request submitted for ${cleaned}. Await admin approval.`);
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
      <PageHeader title="Children" subtitle="Link a child and view your linked children." />

      {/* Link form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Link a child</div>
        <div className="mt-1 text-sm text-slate-400">
          Enter student number/public student ID (for example: STU-1001). South African ID is also supported.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="STU-1001"
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />

          <button
            type="button"
            onClick={() => {
              void onLinkChild();
            }}
            disabled={linking}
            className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {linking ? "Linking..." : "Link child"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          Signed in as: <span className="text-slate-200">{parentEmail}</span>
        </div>
      </div>

      {/* Linked children list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Linked children</div>
        <div className="mt-1 text-sm text-slate-400">These children are available in Calendar, Results, and Finance.</div>

        <div className="mt-4 space-y-3">
          {loadingChildren ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              Loading linked children...
            </div>
          ) : children.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              No linked children. Link a child first.
            </div>
          ) : (
            children.map((child) => (
              <div key={child.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white font-semibold">{child.email}</div>
                    <div className="mt-1 text-xs text-slate-300">Role: {child.role}</div>
                    <div className="mt-1 text-xs text-slate-400">Student Number: {childStudentLabel(child)}</div>
                  </div>

                  <div className="rounded-full border border-emerald-700/40 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-200">
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
