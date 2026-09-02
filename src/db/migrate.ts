import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrationen angewendet.");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
