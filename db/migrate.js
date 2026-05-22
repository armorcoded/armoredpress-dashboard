#!/usr/bin/env node
// db/migrate.js — run with: node db/migrate.js
// Reads all *.sql files in db/migrations/ in filename order and executes them.
// In production DATABASE_URL comes from the container environment directly.
// In local dev it falls back to .env.local if dotenv is available.

const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

// Load .env.local for local development — silently skip if dotenv isn't present
// (it won't be in the production Docker image which gets DATABASE_URL from env).
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
} catch {
  // dotenv not available — rely on environment variables already being set.
}

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Running ${files.length} migration(s)...`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`  → ${file}`);
    await pool.query(sql);
  }

  console.log('✓ Migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
