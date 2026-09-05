// One-shot database purge for local testing. Drops every table/type in the
// `public` schema of the configured database, then recreates an empty schema.
// The next server start (run.bat) rebuilds the schema and re-seeds the default
// slug / mecha templates via initSchema() + seedDefaultSlugTemplates().
//
// Guarded: never runs without the caller passing --yes (purge_db.bat asks for
// a typed confirmation before adding that flag).
import pg from "pg";
import "dotenv/config";

if (!process.argv.includes("--yes")) {
  console.error(
    "Refusing to purge without confirmation. Run purge_db.bat instead, " +
      "or pass --yes explicitly."
  );
  process.exit(1);
}

const config = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
};

const pool = new pg.Pool(config);

async function main() {
  console.log(
    `Purging database "${config.database}" on ${config.host}:${config.port} ...`
  );
  await pool.query("DROP SCHEMA public CASCADE;");
  await pool.query("CREATE SCHEMA public;");
  // Restore the default grants a fresh Postgres database ships with, so the
  // app user can rebuild the schema on next start.
  await pool.query(`GRANT ALL ON SCHEMA public TO ${config.user};`);
  await pool.query("GRANT ALL ON SCHEMA public TO public;");
  console.log("Done. The schema is empty -- start the server to rebuild it.");
}

main()
  .catch((err) => {
    console.error("Purge failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
