const express = require('express');
const { verifyCredentials } = require('../services/authService');
const { validLogin } = require('../validators/common');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/client');
  return res.render('login');
});

router.post('/login', async (req, res) => {
  const login = String(req.body.login || '').trim();
  const password = String(req.body.password || '');

  if (!validLogin(login) || password.length < 6) {
    req.flash('error', 'Проверьте логин и пароль.');
    return res.redirect('/login');
  }

  const user = await verifyCredentials(login, password);
  if (!user) {
    req.flash('error', 'Неверный логин или пароль.');
    return res.redirect('/login');
  }

  req.session.regenerate(() => {
    req.session.user = user;
    res.redirect(user.role === 'admin' ? '/admin' : '/client');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
