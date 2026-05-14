// Run this script to remove the seed/demo accounts created by seed.js
// Usage: node backend/src/config/cleanup-seed.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./database');

async function cleanup() {
  const client = await pool.connect();
  try {
    const seedEmails = ['lead@elitez.com', 'alice@elitez.com', 'bob@elitez.com', 'carol@elitez.com', 'david@elitez.com'];
    const { rowCount, rows } = await client.query(
      `DELETE FROM users WHERE email = ANY($1) RETURNING name, email`,
      [seedEmails]
    );
    if (rowCount === 0) {
      console.log('No seed accounts found — nothing to delete.');
    } else {
      console.log(`Deleted ${rowCount} seed account(s):`);
      rows.forEach(r => console.log(`  - ${r.name} (${r.email})`));
    }
  } catch (err) {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup();
