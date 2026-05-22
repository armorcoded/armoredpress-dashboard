#!/usr/bin/env node
// db/seed-admin.js — run with: node db/seed-admin.js
// Creates the first internal_admin user. Run once after first deploy.

const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const path     = require('path');
const readline = require('readline');

try { require('dotenv').config({ path: path.join(__dirname, '../.env.local') }); } catch {}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function seed() {
  console.log('\nArmoredPress — Create first internal_admin\n');

  const email    = await prompt('Email: ');
  const password = await prompt('Password (min 12 chars): ');

  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()],
  );

  if (existing.length > 0) {
    console.error(`User ${email} already exists.`);
    process.exit(1);
  }

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, is_active)
     VALUES ($1, $2, 'internal_admin', TRUE)
     RETURNING id, email, role`,
    [email.toLowerCase(), hash],
  );

  console.log('\n✓ internal_admin created:');
  console.table(rows[0]);
  console.log('\nNext: log in and enable 2FA from Settings.\n');

  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
