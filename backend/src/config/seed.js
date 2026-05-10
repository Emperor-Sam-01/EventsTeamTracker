require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./database');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    const password = await bcrypt.hash('password123', 10);

    await client.query(`
      INSERT INTO users (name, email, password_hash, role, join_date, salary, cpf_type, cpf_rate, permit_cost)
      VALUES
        ('Team Lead', 'lead@elitez.com', $1, 'bdm', '2022-01-01', 5000, 'local', 0.17, 0),
        ('Alice Tan', 'alice@elitez.com', $1, 'bde', '2023-03-01', 3500, 'local', 0.17, 0),
        ('Bob Lim', 'bob@elitez.com', $1, 'bde', '2023-06-01', 3500, 'pr', 0.13, 0),
        ('Carol Ng', 'carol@elitez.com', $1, 'pe', '2022-09-01', 3200, 'local', 0.17, 0),
        ('David Koh', 'david@elitez.com', $1, 'bda', '2025-01-01', 2200, 'local', 0.17, 0)
      ON CONFLICT (email) DO NOTHING
    `, [password]);

    console.log('Seed complete. Default password: password123');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
