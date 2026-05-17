
const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, comparePassword } = require('../utils/hash');

router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Register' });
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, worker_type } = req.body;
    if (!name || !email || !password || !role) return res.status(400).send('Lengkapi data.');
    if (!['customer','worker','admin'].includes(role)) return res.status(400).send('Role tidak valid.');
    const finalRole = role === 'worker' ? (worker_type === 'digital' ? 'worker_digital' : 'worker_onsite') : role;
    const existing = db.getUserByEmail(email);
    if (existing) return res.status(400).send('Email sudah terdaftar.');
    const pw = await hashPassword(password);
    const user = db.createUser(finalRole, name, email, phone || '', pw);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    if (finalRole.startsWith('worker')) {
      const type = (finalRole === 'worker_digital') ? 'digital' : 'onsite';
      db.upsertWorkerProfile(user.id, { type, status: 'NEW' });
      return res.redirect(`/workers/register?type=${type}&step=1`);
    }
    if (finalRole === 'admin') return res.redirect('/admin');
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).send('Gagal register.');
  }
});

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.getUserByEmail(email);
  if (!user) return res.status(400).send('Email tidak ditemukan.');
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) return res.status(400).send('Password salah.');
  req.session.userId = user.id;
  req.session.userRole = user.role;
  if (user.role === 'admin') return res.redirect('/admin');
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy(()=> res.redirect('/'));
});

module.exports = router;
