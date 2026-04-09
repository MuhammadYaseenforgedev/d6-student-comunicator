import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  getMyStudentProfile,
  saveMyStudentProfile,
  type StudentCourseOption,
  type StudentProfileDetail,
} from "../lib/studentProfileApi";

const FEE_STATUS_OPTIONS: Array<{
  value: StudentProfileDetail["feeStatus"];
  label: string;
}> = [
  { value: "", label: "Select fee status" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "OUTSTANDING", label: "Outstanding" },
];

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
  feeStatus: "fee status",
  paymentMethod: "payment method",
  amountDue: "amount due",
  amountPaid: "amount paid",
  lastPaymentDate: "last payment date",
  email: "email",
};

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
  feeStatus: StudentProfileDetail["feeStatus"];
  paymentMethod: string;
  amountDue: string;
  amountPaid: string;
  lastPaymentDate: string;
  paymentReference: string;
};

function toFormState(profile: StudentProfileDetail): FormState {
  return {
    fullName: profile.fullName,
    surname: profile.surname,
    email: profile.email,
    idNumber: profile.idNumber,
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
    studentNumber: profile.studentNumber,
    feeStatus: profile.feeStatus,
    paymentMethod: profile.paymentMethod,
    amountDue: profile.amountDue == null ? "" : profile.amountDue.toFixed(2),
    amountPaid: profile.amountPaid == null ? "" : profile.amountPaid.toFixed(2),
    lastPaymentDate: profile.lastPaymentDate ?? "",
    paymentReference: profile.paymentReference ?? "",
  };
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="teal-glow-card p-5">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-white/70">{subtitle}</div> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
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

export default function StudentPersonalDetails() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState | null>(null);
  const [profile, setProfile] = useState<StudentProfileDetail | null>(null);
  const [availableCourses, setAvailableCourses] = useState<StudentCourseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
        studentNumber: form.studentNumber,
        idNumber: form.idNumber,
        dateOfBirth: form.dateOfBirth || null,
        mobileNumber: form.mobileNumber,
        alternativeContactNumber: form.alternativeContactNumber || null,
        streetAddress: form.streetAddress,
        city: form.city,
        province: form.province,
        postalCode: form.postalCode,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactNumber: form.emergencyContactNumber || null,
        courseId: form.courseId || null,
        feeStatus: form.feeStatus,
        paymentMethod: form.paymentMethod,
        amountDue: form.amountDue.trim() ? Number(form.amountDue) : null,
        amountPaid: form.amountPaid.trim() ? Number(form.amountPaid) : null,
        lastPaymentDate: form.lastPaymentDate || null,
        paymentReference: form.paymentReference || null,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal Details"
        subtitle="Keep your registration, contact, address, and payment information up to date."
        actions={
          profile?.isComplete ? (
            <button
              type="button"
              onClick={() => navigate("/app")}
              className="btn-secondary"
            >
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
        <div className="info-banner">Loading personal details...</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <Section
            title="Personal"
            subtitle="These details identify your student record and stay linked to your account."
          >
            <Field label="Full Name" htmlFor="student-full-name">
              <input
                id="student-full-name"
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                className="input-glass"
                placeholder="Full name"
              />
            </Field>

            <Field label="Surname" htmlFor="student-surname">
              <input
                id="student-surname"
                value={form.surname}
                onChange={(e) => updateField("surname", e.target.value)}
                className="input-glass"
                placeholder="Surname"
              />
            </Field>

            <Field label="ID Number" htmlFor="student-id-number">
              <input
                id="student-id-number"
                inputMode="numeric"
                value={form.idNumber}
                onChange={(e) => updateField("idNumber", e.target.value)}
                className="input-glass"
                placeholder="13-digit ID number"
              />
            </Field>

            <Field label="Date Of Birth" htmlFor="student-date-of-birth">
              <input
                id="student-date-of-birth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
                className="input-glass"
              />
            </Field>

            <Field label="Email" htmlFor="student-email">
              <input
                id="student-email"
                value={form.email}
                className="input-glass opacity-80"
                readOnly
                disabled
              />
            </Field>

            <Field label="Student Number" htmlFor="student-number">
              <input
                id="student-number"
                value={form.studentNumber}
                onChange={(e) => updateField("studentNumber", e.target.value.toUpperCase())}
                className="input-glass"
                placeholder="Student number"
              />
            </Field>
          </Section>

          <Section
            title="Contact"
            subtitle="Use the same contact styles already used across the app for quick edits on mobile and desktop."
          >
            <Field label="Mobile Number" htmlFor="student-mobile">
              <input
                id="student-mobile"
                value={form.mobileNumber}
                onChange={(e) => updateField("mobileNumber", e.target.value)}
                className="input-glass"
                placeholder="Mobile number"
              />
            </Field>

            <Field label="Alternative Contact Number" htmlFor="student-alt-mobile">
              <input
                id="student-alt-mobile"
                value={form.alternativeContactNumber}
                onChange={(e) => updateField("alternativeContactNumber", e.target.value)}
                className="input-glass"
                placeholder="Optional alternative number"
              />
            </Field>

            <Field label="Emergency Contact Name" htmlFor="student-emergency-name">
              <input
                id="student-emergency-name"
                value={form.emergencyContactName}
                onChange={(e) => updateField("emergencyContactName", e.target.value)}
                className="input-glass"
                placeholder="Optional emergency contact"
              />
            </Field>

            <Field label="Emergency Contact Number" htmlFor="student-emergency-number">
              <input
                id="student-emergency-number"
                value={form.emergencyContactNumber}
                onChange={(e) => updateField("emergencyContactNumber", e.target.value)}
                className="input-glass"
                placeholder="Optional emergency number"
              />
            </Field>
          </Section>

          <Section
            title="Address"
            subtitle="Address information is stored with your student profile and can be updated whenever details change."
          >
            <Field label="Street Address" htmlFor="student-street-address">
              <input
                id="student-street-address"
                value={form.streetAddress}
                onChange={(e) => updateField("streetAddress", e.target.value)}
                className="input-glass"
                placeholder="Street address"
              />
            </Field>

            <Field label="City" htmlFor="student-city">
              <input
                id="student-city"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="input-glass"
                placeholder="City"
              />
            </Field>

            <Field label="Province" htmlFor="student-province">
              <input
                id="student-province"
                value={form.province}
                onChange={(e) => updateField("province", e.target.value)}
                className="input-glass"
                placeholder="Province"
              />
            </Field>

            <Field label="Postal Code" htmlFor="student-postal-code">
              <input
                id="student-postal-code"
                value={form.postalCode}
                onChange={(e) => updateField("postalCode", e.target.value)}
                className="input-glass"
                placeholder="Postal code"
              />
            </Field>
          </Section>

          <Section
            title="Academic And Fees"
            subtitle="Select your enrolled course and capture fee information in the same account flow used for the rest of the student experience."
          >
            <Field label="Course Of Study" htmlFor="student-course">
              <select
                id="student-course"
                value={form.courseId}
                onChange={(e) => updateField("courseId", e.target.value)}
                className="select-glass"
              >
                <option value="">Select course</option>
                {availableCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Fee Status" htmlFor="student-fee-status">
              <select
                id="student-fee-status"
                value={form.feeStatus}
                onChange={(e) =>
                  updateField(
                    "feeStatus",
                    e.target.value as StudentProfileDetail["feeStatus"]
                  )
                }
                className="select-glass"
              >
                {FEE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Payment Method" htmlFor="student-payment-method">
              <input
                id="student-payment-method"
                value={form.paymentMethod}
                onChange={(e) => updateField("paymentMethod", e.target.value)}
                className="input-glass"
                placeholder="Payment method"
              />
            </Field>

            <Field label="Amount Due" htmlFor="student-amount-due">
              <input
                id="student-amount-due"
                type="number"
                min="0"
                step="0.01"
                value={form.amountDue}
                onChange={(e) => updateField("amountDue", e.target.value)}
                className="input-glass"
                placeholder="0.00"
              />
            </Field>

            <Field label="Amount Paid" htmlFor="student-amount-paid">
              <input
                id="student-amount-paid"
                type="number"
                min="0"
                step="0.01"
                value={form.amountPaid}
                onChange={(e) => updateField("amountPaid", e.target.value)}
                className="input-glass"
                placeholder="0.00"
              />
            </Field>

            <Field label="Last Payment Date" htmlFor="student-last-payment-date">
              <input
                id="student-last-payment-date"
                type="date"
                value={form.lastPaymentDate}
                onChange={(e) => updateField("lastPaymentDate", e.target.value)}
                className="input-glass"
              />
            </Field>

            <Field label="Payment Reference" htmlFor="student-payment-reference">
              <input
                id="student-payment-reference"
                value={form.paymentReference}
                onChange={(e) => updateField("paymentReference", e.target.value)}
                className="input-glass"
                placeholder="Optional payment reference"
              />
            </Field>
          </Section>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="btn-primary min-w-[150px]">
              {saving ? "Saving..." : "Save details"}
            </button>

            <button
              type="button"
              onClick={() => {
                void loadProfile();
              }}
              disabled={loading || saving}
              className="btn-secondary"
            >
              Reload
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
