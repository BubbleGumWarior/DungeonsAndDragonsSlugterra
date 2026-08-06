import pg from "pg";
import "dotenv/config";

const targetDb = process.env.PGDATABASE;

const adminPool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: "postgres",
});

const { rows } = await adminPool.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [targetDb]
);

if (rows.length === 0) {
  await adminPool.query(`CREATE DATABASE "${targetDb}"`);
  console.log(`Database "${targetDb}" created.`);
} else {
  console.log(`Database "${targetDb}" already exists.`);
}

await adminPool.end();
