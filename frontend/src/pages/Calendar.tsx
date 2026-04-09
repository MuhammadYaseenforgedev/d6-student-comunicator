import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import CalendarWorkspace from "../components/calendar/CalendarWorkspace";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { listCourses, type CourseRecord } from "../lib/courseApi";

export default function Calendar() {
  const role = (getUser()?.role ?? "STUDENT").toUpperCase();
  const [courseOptions, setCourseOptions] = useState<CourseRecord[]>([]);
  const canAssignCourse = role === "ADMIN" || role === "LECTURER";

  const subtitle = useMemo(() => {
    if (role === "ADMIN") {
      return "A richer planning workspace for personal, course-linked, and shared visible events.";
    }
    if (role === "LECTURER") {
      return "Manage your calendar with course-aware visibility preserved for everything you can already see.";
    }
    return "A clearer planning calendar for your personal schedule, course items, and visible shared events.";
  }, [role]);

  useEffect(() => {
    if (!canAssignCourse) return;

    let cancelled = false;

    void listCourses()
      .then((rows) => {
        if (!cancelled) {
          setCourseOptions(rows.filter((course) => course.isActive));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCourseOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canAssignCourse]);

  if (role === "PARENT") return <Navigate to="/app/parent/calendar" replace />;

  return (
    <div>
      <PageHeader title="Calendar" subtitle={subtitle} />
      <div className="mt-6">
        <CalendarWorkspace courseOptions={canAssignCourse ? courseOptions : []} />
      </div>
    </div>
  );
}
