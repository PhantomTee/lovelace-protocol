const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const [jobsResult, eventsResult] = await Promise.all([
      db.query(`SELECT * FROM jobs ORDER BY completed_at DESC LIMIT 100`),
      db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 200`),
    ]);
    const jobs = jobsResult.rows;
    const events = eventsResult.rows;
    res.json({
      jobs,
      events,
      stats: {
        totalJobs: jobs.length,
        totalEvents: events.length,
        agents: [...new Set(jobs.map(j => j.agent_name))].length,
        volumeMnt: jobs.reduce((s, j) => s + parseFloat(j.escrow_mnt || 0), 0).toFixed(4),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
