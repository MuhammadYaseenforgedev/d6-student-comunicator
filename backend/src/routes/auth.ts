import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { pool } from "../config/db";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const VALID_ROLES = ["ADMIN", "LECTURER", "STUDENT", "PARENT"] as const;
type Role = (typeof VALID_ROLES)[number];

type JwtUser = {
  id: string;
  email: string;
  role: Role;
};

function signToken(user: JwtUser) {
  // Force correct types for jsonwebtoken overloads
  const secret: Secret = (process.env.JWT_SECRET ?? "dev_secret_change_me") as Secret;

  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];

  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn }
  );
}

/* =========
   REGISTER
   ========= */
authRouter.post("/auth/register", async (req, res) => {
  const { email, password, role } = req.body as {
    email?: string;
    password?: string;
    role?: string;
  };

  if (!email || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

  if (!VALID_ROLES.includes(role as Role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `
      insert into users (email, password_hash, role)
      values ($1, $2, $3)
      returning id, email, role
      `,
      [email.toLowerCase().trim(), passwordHash, role]
    );

    const user = result.rows[0] as JwtUser;
    const token = signToken(user);

    return res.status(201).json({ token, user });
  } catch {
    return res.status(400).json({ error: "Email already exists" });
  }
});

/* =========
   LOGIN
   ========= */
authRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const result = await pool.query(`select * from users where email = $1`, [
    email.toLowerCase().trim(),
  ]);

  const userRow = result.rows[0];
  if (!userRow) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, userRow.password_hash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const user: JwtUser = {
    id: userRow.id,
    email: userRow.email,
    role: userRow.role,
  };

  const token = signToken(user);

  return res.json({ token, user });
});

/* =========
   ME
   ========= */
authRouter.get("/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});
