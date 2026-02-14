import { pool } from "../config/db";

export type FinanceSummary = {
  userId: string;
  balanceCents: number;
  currency: string;
  updatedAt: string;
};

export type FinanceTransaction = {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  description: string;
  occurredAt: string;
  createdAt: string;
};

type SummaryRow = {
  user_id: string;
  balance_cents: number;
  currency: string;
  updated_at: string;
};

type TxRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  description: string;
  occurred_at: string;
  created_at: string;
};

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

export const pgFinanceRepo = {
  async ensureAccount(userId: string): Promise<void> {
    const q = `
      INSERT INTO finance_accounts (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `;
    await pool.query(q, [userId]);
  },

  async getSummary(userId: string): Promise<FinanceSummary> {
    await this.ensureAccount(userId);

    const q = `
      SELECT user_id, balance_cents, currency, updated_at
      FROM finance_accounts
      WHERE user_id = $1
      LIMIT 1
    `;
    const res = await pool.query<SummaryRow>(q, [userId]);
    const r = res.rows[0];

    return {
      userId: r.user_id,
      balanceCents: r.balance_cents,
      currency: r.currency,
      updatedAt: r.updated_at,
    };
  },

  async listTransactions(userId: string, opts?: { limit?: number }): Promise<FinanceTransaction[]> {
    const limit = parseLimit(opts?.limit, 50);

    const q = `
      SELECT id, user_id, amount_cents, currency, description, occurred_at, created_at
      FROM finance_transactions
      WHERE user_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2
    `;
    const res = await pool.query<TxRow>(q, [userId, limit]);

    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      amountCents: r.amount_cents,
      currency: r.currency,
      description: r.description,
      occurredAt: r.occurred_at,
      createdAt: r.created_at,
    }));
  },
};
