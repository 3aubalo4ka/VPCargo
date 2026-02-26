const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 15,
  charset: 'utf8mb4',
  decimalNumbers: true
});

module.exports = pool;
