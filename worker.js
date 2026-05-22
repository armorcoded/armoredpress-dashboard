#!/usr/bin/env node
/**
 * ArmoredPress — Provisioning worker
 *
 * Run separately from Next.js:
 *   node worker.js
 *
 * In docker-compose, add a second 'app' service variant with:
 *   command: node worker.js
 *
 * Or run inline for dev:
 *   npm run worker
 */

// Register ts-node/esm if needed, otherwise compile first.
require('dotenv').config({ path: '.env.local' });

const { startProvisioningWorker } = require('./lib/queue/provisioning');

console.log('[worker] Starting provisioning worker...');
const worker = startProvisioningWorker();

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received — draining...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[worker] SIGINT received — draining...');
  await worker.close();
  process.exit(0);
});
