const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.POSTGRES_URL);

module.exports = sql;