import fs from "fs";
import path from "path";
import dotenv from "dotenv";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

const rootDir = path.resolve(__dirname, "../..");
const explicit = String(process.env.ENV_FILE ?? "").trim();
const candidates: string[] = [];

if (explicit) {
  candidates.push(path.isAbsolute(explicit) ? explicit : path.resolve(rootDir, explicit));
} else {
  candidates.push(path.resolve(rootDir, ".env.test"));
  candidates.push(path.resolve(rootDir, ".env"));
}

for (const envPath of candidates) {
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath, override: false });
  break;
}

