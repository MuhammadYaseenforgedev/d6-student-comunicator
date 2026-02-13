import { pool } from "../config/db";

export type ParentChild = {
  id: string;
  email: string;
};

type ParentChildRow = {
  id: string;
  email: string;
};

export const pgParentLinksRepo = {
  async listChildren(parentUserId: string): Promise<ParentChild[]> {
    const q = `
      SELECT u.id, u.email
      FROM parent_links pl
      JOIN users u ON u.id = pl.student_user_id
      WHERE pl.parent_user_id = $1
      ORDER BY u.email ASC
    `;

    const res = await pool.query<ParentChildRow>(q, [parentUserId]);
    return res.rows.map((r) => ({ id: r.id, email: r.email }));
  },

  async linkChildByEmail(
    parentUserId: string,
    studentEmail: string
  ): Promise<{ created: boolean; child: ParentChild | null }> {
    const email = studentEmail.trim();
    if (!email) return { created: false, child: null };

    const studentQ = `
      SELECT id, email
      FROM users
      WHERE lower(email) = lower($1)
        AND role = 'STUDENT'
      LIMIT 1
    `;

    const studentRes = await pool.query<ParentChildRow>(studentQ, [email]);

    if (studentRes.rowCount === 0) {
      return { created: false, child: null };
    }

    const child: ParentChild = {
      id: studentRes.rows[0].id,
      email: studentRes.rows[0].email,
    };

    if (child.id === parentUserId) {
      return { created: false, child: null };
    }

    const insertQ = `
      INSERT INTO parent_links (parent_user_id, student_user_id)
      VALUES ($1, $2)
      ON CONFLICT (parent_user_id, student_user_id) DO NOTHING
      RETURNING parent_user_id
    `;

    const insRes = await pool.query<{ parent_user_id: string }>(insertQ, [
      parentUserId,
      child.id,
    ]);

    return { created: insRes.rowCount === 1, child };
  },

  async unlinkChild(parentUserId: string, studentUserId: string): Promise<boolean> {
    const q = `
      DELETE FROM parent_links
      WHERE parent_user_id = $1
        AND student_user_id = $2
    `;

    const res = await pool.query(q, [parentUserId, studentUserId]);
    return res.rowCount === 1;
  },
};
