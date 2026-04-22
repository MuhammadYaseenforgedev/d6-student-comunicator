export type Queryable = {
  query: <T>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type CourseCalendarSyncResult = {
  templateCount: number;
  syncedCount: number;
};

export async function syncCalendarForAssignedCourse(
  db: Queryable,
  input: { studentId: string; courseId: string }
): Promise<CourseCalendarSyncResult> {
  const result = await db.query<{
    template_count: number;
    synced_count: number;
  }>(
    `
      WITH source_templates AS (
        SELECT
          id,
          course_id,
          module_id,
          title,
          description,
          location,
          starts_at,
          ends_at,
          reminder_minutes_before,
          external_provider,
          external_event_id,
          sync_metadata
        FROM course_schedule_templates
        WHERE course_id = $2
          AND is_active = true
      ),
      upserted AS (
        INSERT INTO calendar_entries (
          user_id,
          course_id,
          module_id,
          course_schedule_template_id,
          event_source,
          source_reference_id,
          title,
          description,
          location,
          starts_at,
          ends_at,
          reminder_minutes_before,
          external_provider,
          external_event_id,
          sync_metadata,
          updated_at
        )
        SELECT
          $1,
          st.course_id,
          st.module_id,
          st.id,
          'COURSE_SYNC',
          st.id::text,
          st.title,
          st.description,
          st.location,
          st.starts_at,
          st.ends_at,
          st.reminder_minutes_before,
          st.external_provider,
          st.external_event_id,
          st.sync_metadata,
          now()
        FROM source_templates st
        ON CONFLICT (user_id, course_schedule_template_id)
          WHERE event_source = 'COURSE_SYNC'
            AND course_schedule_template_id IS NOT NULL
        DO UPDATE SET
          course_id = EXCLUDED.course_id,
          module_id = EXCLUDED.module_id,
          event_source = 'COURSE_SYNC',
          source_reference_id = EXCLUDED.source_reference_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          reminder_minutes_before = EXCLUDED.reminder_minutes_before,
          external_provider = EXCLUDED.external_provider,
          external_event_id = EXCLUDED.external_event_id,
          sync_metadata = EXCLUDED.sync_metadata,
          updated_at = now()
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*)::int FROM source_templates) AS template_count,
        COUNT(*)::int AS synced_count
      FROM upserted
    `,
    [input.studentId, input.courseId]
  );

  return {
    templateCount: Number(result.rows[0]?.template_count ?? 0),
    syncedCount: Number(result.rows[0]?.synced_count ?? 0),
  };
}
