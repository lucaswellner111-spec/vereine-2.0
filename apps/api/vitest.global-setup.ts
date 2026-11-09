import { dropTestDatabases } from "./src/testing/test-db";

/** Nur mit TEST_DATABASE_URL: Reste alter Laeufe vorher und alle Test-Datenbanken danach entfernen. */
export async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  await dropTestDatabases(url);
  console.log("API-Tests laufen gegen echtes Postgres (TEST_DATABASE_URL)");
  return async () => {
    const n = await dropTestDatabases(url);
    console.log(`${n} Test-Datenbanken entfernt`);
  };
}
