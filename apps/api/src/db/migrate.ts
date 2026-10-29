import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), {
    migrationsFolder: join(__dirname, "..", "..", "drizzle"),
  });
  await client.end();
  console.log("Migrationen angewendet");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
