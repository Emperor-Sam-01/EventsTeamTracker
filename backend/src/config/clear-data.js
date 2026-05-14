// Clears all operational data (meetings, projects, clients) while preserving users.
// Usage: node backend/src/config/clear-data.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./database');

async function clearData() {
  const client = await pool.connect();
  try {
    console.log('Clearing operational data...');
    await client.query('DELETE FROM sales_effort');
    await client.query('DELETE FROM weekly_meetings');
    await client.query('DELETE FROM project_crew');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM clients');
    console.log('Done — weekly meetings, projects, and clients have been cleared.');
    console.log('Users, DISC profiles, and reviews are untouched.');
  } catch (err) {
    console.error('Clear failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();
