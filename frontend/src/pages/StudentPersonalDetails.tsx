import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  getMyStudentProfile,
  saveMyStudentProfile,
  type StudentCourseOption,
  type StudentProfileDetail,
} from "../lib/studentProfileApi";
import { submitSupportTicket } from "../lib/supportApi";

const MISSING_LABELS: Record<string, string> = {
  fullName: "full name",
  surname: "surname",
  studentNumber: "student number",
  idNumber: "ID number",
  mobileNumber: "mobile number",
  streetAddress: "street address",
  city: "city",
  province: "province",
  postalCode: "postal code",
  courseId: "course",
  email: "email",
};

type TabId = "personal" | "academic" | "finance" | "report";

type FormState = {
  fullName: string;
  surname: string;
  email: string;
  idNumber: string;
  dateOfBirth: string;
  mobileNumber: string;
  alternativeContactNumber: string;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  courseId: string;
  studentNumber: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "personal", label: "Personal info" },
  { id: "academic", label: "Academic info" },
  { id: "finance", label: "Finance" },
  { id: "report", label: "Report issue" },
];

function toFormState(profile: StudentProfileDetail): FormState {
  return {
    fullName: profile.fullName,
    surname: profile.surname,
    email: profile.email,
    idNumber: profile.idNumber ?? "",
    dateOfBirth: profile.dateOfBirth ?? "",
    mobileNumber: profile.mobileNumber,
    alternativeContactNumber: profile.alternativeContactNumber ?? "",
    streetAddress: profile.streetAddress,
    city: profile.city,
    province: profile.province,
    postalCode: profile.postalCode,
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactNumber: profile.emergencyContactNumber ?? "",
    courseId: profile.courseId ?? "",
    studentNumber: profile.studentNumber ?? "",
  };
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
        {label}
      </div>
      {children}
    </label>
  );
}

function ReadOnlyStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-[rgba(255,196,87,0.28)] bg-[rgba(255,196,87,0.10)] text-[#ffecc2]"
      : tone === "success"
        ? "border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.10)] text-[#d9fff1]"
        : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.58)] text-white";

  return (
    <div className={["rounded-2xl border p-4", toneClass].join(" ")}>
      <div className="text-xs uppercase tracking-[0.16em] text-white/55">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value || "Not recorded"}</div>
    </div>
  );
}

function formatMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Not recorded";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "ZAR",
  }).format(value);
}

function formatDate(raw: string | null): string {
  if (!raw) return "Not recorded";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleDateString();
}

export default function StudentPersonalDetails() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("personal");
  const [form, setForm] = useState<FormState | null>(null);
  const [profile, setProfile] = useState<StudentProfileDetail | null>(null);
  const [availableCourses, setAvailableCourses] = useState<StudentCourseOption[]>([]);
  const [reportMessage, setReportMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function loadProfile() {
    try {
      setLoading(true);
      setError(null);
      const data = await getMyStudentProfile();
      setProfile(data.profile);
      setForm(toFormState(data.profile));
      setAvailableCourses(data.availableCourses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load personal details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  const missingSummary = useMemo(() => {
    if (!profile?.missingFields?.length) return "";
    return profile.missingFields
      .map((field) => MISSING_LABELS[field] ?? field)
      .join(", ");
  }, [profile?.missingFields]);

  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === form?.courseId) ?? null,
    [availableCourses, form?.courseId]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;

    try {
      setSaving(true);
      setError(null);
      setInfo(null);

      const result = await saveMyStudentProfile({
        fullName: form.fullName,
        surname: form.surname,
        dateOfBirth: form.dateOfBirth || null,
        mobileNumber: form.mobileNumber,
        alternativeContactNumber: form.alternativeContactNumber || null,
        streetAddress: form.streetAddress,
        city: form.city,
        province: form.province,
        postalCode: form.postalCode,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactNumber: form.emergencyContactNumber || null,
      });

      setProfile(result.profile);
      setForm(toFormState(result.profile));
      setAvailableCourses(result.availableCourses);
      setInfo(
        result.profile.isComplete
          ? "Personal details saved. Your dashboard access is fully unlocked."
          : "Personal details saved. Finish the remaining required fields to unlock the full dashboard."
      );

      window.dispatchEvent(new Event("student-profile-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save personal details");
    } finally {
      setSaving(false);
    }
  }

  async function onReportIncorrectInfo() {
    if (!profile) return;
    const message = reportMessage.trim();
    if (!message) {
      setError("Describe what needs to be corrected before submitting.");
      return;
    }

    try {
      setReporting(true);
      setError(null);
      setInfo(null);
      await submitSupportTicket({
        email: profile.email,
        name: `${profile.fullName} ${profile.surname}`.trim() || profile.email,
        issueType: "OTHER",
        message: `Student profile correction request:\n\n${message}`,
      });
      setReportMessage("");
      setInfo("Correction request submitted. Support will review the details.");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to submit correction request");
    } finally {
      setReporting(false);
    }
  }

  const financeTone =
    profile?.feeStatus === "PAID"
      ? "success"
      : profile?.feeStatus === "OUTSTANDING" || profile?.feeStatus === "PARTIAL"
        ? "warning"
        : "default";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal Details"
        subtitle="A structured view of your profile, study information, finance status, and correction workflow."
        actions={
          profile?.isComplete ? (
            <button type="button" onClick={() => navigate("/app")} className="btn-secondary">
              Open dashboard
            </button>
          ) : undefined
        }
      />

      {error && <div className="error-banner">{error}</div>}
      {info && <div className="info-banner">{info}</div>}

      {profile && !profile.isComplete && (
        <div className="info-banner border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] text-[#ffe8b0] shadow-none">
          Complete the required fields to unlock the full dashboard.
          {missingSummary ? ` Still needed: ${missingSummary}.` : ""}
        </div>
      )}

      {loading || !form ? (
        <div className="space-y-4">
          <div className="teal-glow-card h-28 animate-pulse p-5" />
          <div className="teal-glow-card h-64 animate-pulse p-5" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <section className="teal-glow-card p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="text-lg font-semibold text-white">
                  {form.fullName || "Student"} {form.surname}
                </div>
                <div className="mt-1 text-sm text-white/65">
                  {form.studentNumber || "No student number"} | {profile?.courseName || "No course assigned"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[rgba(140,235,255,0.24)] bg-[rgba(140,235,255,0.10)] px-3 py-1 text-xs font-semibold text-[#8CEBFF]">
                  {profile?.isComplete ? "Complete" : "Needs info"}
                </span>
                <span className="rounded-full border border-[rgba(255,196,87,0.22)] bg-[rgba(255,196,87,0.10)] px-3 py-1 text-xs font-semibold text-[#ffecc2]">
                  Finance read-only
                </span>
              </div>
            </div>

            <div className="mobile-chip-row mt-5 sm:flex sm:flex-wrap sm:gap-2" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={["tab-pill", activeTab === tab.id ? "tab-pill-active" : "tab-pill-idle"].join(" ")}
                  aria-pressed={activeTab === tab.id}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "personal" && (
            <section className="teal-glow-card p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Full Name" htmlFor="student-full-name">
                  <input id="student-full-name" value={form.fullName} onChange={(e) => updateField("fullName", e.target.value)} className="input-glass" />
                </Field>
                <Field label="Surname" htmlFor="student-surname">
                  <input id="student-surname" value={form.surname} onChange={(e) => updateField("surname", e.target.value)} className="input-glass" />
                </Field>
                <Field label="Email" htmlFor="student-email">
                  <input id="student-email" value={form.email} className="input-glass opacity-80" readOnly disabled />
                </Field>
                <Field label="Mobile Number" htmlFor="student-mobile">
                  <input id="student-mobile" value={form.mobileNumber} onChange={(e) => updateField("mobileNumber", e.target.value)} className="input-glass" />
                </Field>
                <Field label="ID Number" htmlFor="student-id-number">
                  <input id="student-id-number" inputMode="numeric" value={form.idNumber || "Not recorded"} className="input-glass opacity-80" readOnly disabled />
                </Field>
                <Field label="Date Of Birth" htmlFor="student-date-of-birth">
                  <input id="student-date-of-birth" type="date" value={form.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} className="input-glass" />
                </Field>
                <Field label="Street Address" htmlFor="student-street-address">
                  <input id="student-street-address" value={form.streetAddress} onChange={(e) => updateField("streetAddress", e.target.value)} className="input-glass" />
                </Field>
                <Field label="City" htmlFor="student-city">
                  <input id="student-city" value={form.city} onChange={(e) => updateField("city", e.target.value)} className="input-glass" />
                </Field>
                <Field label="Province" htmlFor="student-province">
                  <input id="student-province" value={form.province} onChange={(e) => updateField("province", e.target.value)} className="input-glass" />
                </Field>
                <Field label="Postal Code" htmlFor="student-postal-code">
                  <input id="student-postal-code" value={form.postalCode} onChange={(e) => updateField("postalCode", e.target.value)} className="input-glass" />
                </Field>
              </div>
            </section>
          )}

          {activeTab === "academic" && (
            <section className="teal-glow-card p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ReadOnlyStat label="Student number" value={form.studentNumber} />
                <ReadOnlyStat label="Current course" value={profile?.courseName ?? ""} />
                <ReadOnlyStat label="Academic status" value={profile?.isComplete ? "Profile complete" : "Profile pending"} />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Student Number" htmlFor="student-number">
                  <input id="student-number" value={form.studentNumber || "Not assigned"} className="input-glass opacity-80" readOnly disabled />
                </Field>
                <Field label="Course Of Study" htmlFor="student-course">
                  <input id="student-course" value={profile?.courseName || "Not assigned"} className="input-glass opacity-80" readOnly disabled />
                </Field>
              </div>
              <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.58)] p-4 text-sm text-white/72">
                Student number, ID number, course, and modules are managed by academic staff. Use Report issue if any system-owned information looks incorrect.
                {selectedCourse ? ` Selected course: ${selectedCourse.code} - ${selectedCourse.name}.` : ""}
              </div>
            </section>
          )}

          {activeTab === "finance" && (
            <section className="teal-glow-card p-5">
              <div className="mb-4 rounded-2xl border border-[rgba(255,196,87,0.22)] bg-[rgba(78,54,12,0.22)] p-4 text-sm text-[#ffe7b0]">
                Finance information is read-only here. Use "Report issue" if something looks incorrect.
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ReadOnlyStat label="Fee status" value={profile?.feeStatus || "Not recorded"} tone={financeTone} />
                <ReadOnlyStat label="Amount due" value={formatMoney(profile?.amountDue ?? null)} />
                <ReadOnlyStat label="Amount paid" value={formatMoney(profile?.amountPaid ?? null)} tone="success" />
                <ReadOnlyStat label="Payment method" value={profile?.paymentMethod ?? ""} />
                <ReadOnlyStat label="Payment reference" value={profile?.paymentReference ?? ""} />
                <ReadOnlyStat label="Last payment" value={formatDate(profile?.lastPaymentDate ?? null)} />
              </div>
            </section>
          )}

          {activeTab === "report" && (
            <section className="teal-glow-card p-5">
              <div className="max-w-3xl">
                <div className="text-lg font-semibold text-white">Report Incorrect Info</div>
                <p className="mt-2 text-sm leading-6 text-white/72">
                  Tell support what looks wrong. This creates a support ticket using the existing ticket flow without changing your profile automatically.
                </p>
              </div>
              <div className="mt-4">
                <textarea
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  className="input-glass min-h-[150px]"
                  placeholder="Example: My ID number is correct but my surname is misspelled..."
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => void onReportIncorrectInfo()} disabled={reporting || !reportMessage.trim()} className="btn-primary">
                  {reporting ? "Submitting..." : "Submit correction request"}
                </button>
                <button type="button" onClick={() => setReportMessage("")} disabled={reporting || !reportMessage.trim()} className="btn-secondary">
                  Clear
                </button>
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving || activeTab === "finance" || activeTab === "report"} className="btn-primary min-w-[150px]">
              {saving ? "Saving..." : "Save editable details"}
            </button>
            <button type="button" onClick={() => void loadProfile()} disabled={loading || saving} className="btn-secondary">
              Reload
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
