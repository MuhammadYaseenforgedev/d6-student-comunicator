import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "4000"),

  // DB
  DB_HOST: process.env.DB_HOST ?? "localhost",
  DB_PORT: Number(process.env.DB_PORT ?? "5432"),
  DB_USER: process.env.DB_USER ?? "postgres",
  DB_PASSWORD: required("DB_PASSWORD"),
  DB_NAME: process.env.DB_NAME ?? "d6_student_communicator",
};
