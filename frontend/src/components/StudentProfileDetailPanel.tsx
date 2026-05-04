import type { ReactNode } from "react";
import type { StudentProfileDetail } from "../lib/studentProfileApi";

function formatDate(value: string | null): string {
  if (!value) return "Not provided";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : value;
}

function valueOrFallback(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized || "Not provided";
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(140,235,255,0.12)] bg-[rgba(8,18,48,0.52)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
        {label}
      </div>
      <div className="mt-2 text-sm text-white/88">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default function StudentProfileDetailPanel({
  profile,
}: {
  profile: StudentProfileDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.56)] px-3 py-1 text-xs font-semibold text-white/80">
          {profile.courseCode?.trim() || profile.courseName?.trim() || "Course not assigned"}
        </span>
        <span className="rounded-full border border-[rgba(52,211,153,0.26)] bg-[rgba(52,211,153,0.14)] px-3 py-1 text-xs font-semibold text-[#d9fff1]">
          {profile.isComplete ? "Profile complete" : "Profile incomplete"}
        </span>
      </div>

      <Section title="Personal">
        <Field label="Full Name" value={valueOrFallback(profile.fullName)} />
        <Field label="Surname" value={valueOrFallback(profile.surname)} />
        <Field label="Email" value={valueOrFallback(profile.email)} />
        <Field label="ID Number" value={valueOrFallback(profile.idNumber)} />
        <Field label="Student Number" value={valueOrFallback(profile.studentNumber)} />
        <Field label="Date of Birth" value={formatDate(profile.dateOfBirth)} />
      </Section>

      <Section title="Contact">
        <Field label="Mobile Number" value={valueOrFallback(profile.mobileNumber)} />
        <Field
          label="Alternative Contact"
          value={valueOrFallback(profile.alternativeContactNumber)}
        />
        <Field
          label="Emergency Contact"
          value={valueOrFallback(profile.emergencyContactName)}
        />
        <Field
          label="Emergency Number"
          value={valueOrFallback(profile.emergencyContactNumber)}
        />
      </Section>

      <Section title="Address">
        <Field label="Street Address" value={valueOrFallback(profile.streetAddress)} />
        <Field label="City" value={valueOrFallback(profile.city)} />
        <Field label="Province" value={valueOrFallback(profile.province)} />
        <Field label="Postal Code" value={valueOrFallback(profile.postalCode)} />
      </Section>

      <Section title="Academic">
        <Field label="Course" value={valueOrFallback(profile.courseName)} />
        <Field label="Course Code" value={valueOrFallback(profile.courseCode)} />
      </Section>
    </div>
  );
}
