const { Pool, types } = require('pg');

// Retorna DATE como string YYYY-MM-DD (evita conversão de fuso)
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://psico:psico123@localhost:5432/psicoapp',
});

module.exports = { pool, query: (text, params) => pool.query(text, params) };
