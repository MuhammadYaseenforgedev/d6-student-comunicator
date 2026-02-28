-- Parent link requests (admin-approved workflow)
CREATE TABLE IF NOT EXISTS parent_link_requests (
  id UUID PRIMARY KEY,
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ NULL,
  decided_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (parent_user_id, student_user_id, status)
);

CREATE INDEX IF NOT EXISTS idx_parent_link_requests_parent ON parent_link_requests(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_link_requests_student ON parent_link_requests(student_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_link_requests_status ON parent_link_requests(status);

-- Results (simple table to power Parent Results tab)
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  score INT NOT NULL,
  out_of INT NOT NULL DEFAULT 100,
  assessed_at DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_assessment_results_student ON assessment_results(student_user_id);
