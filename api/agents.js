const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const result = await db.query(
      `SELECT address, name, description, capabilities, price_wei,
              is_active, stake_amount, jobs_completed, registered_at
       FROM agents ORDER BY registered_at ASC`
    );
    res.json({ agents: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
