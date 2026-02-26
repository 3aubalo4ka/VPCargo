const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/client', requireAuth, async (req, res) => {
  const [orders] = await db.execute(
    'SELECT cargo_number, status, payment_status, date_sent, cost, created_at FROM orders WHERE user_id = ? ORDER BY id DESC',
    [req.session.user.id]
  );
  res.render('client', { orders });
});

module.exports = router;
