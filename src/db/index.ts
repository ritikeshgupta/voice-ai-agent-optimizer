import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || "./data/optimizer.sqlite";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// node:sqlite (stable since Node 24, experimental since 22.5) avoids the native-compilation
// step better-sqlite3 needs -- one less thing that can fail a reviewer's `npm install`.
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);
