
const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const { ensureAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage });

router.get('/register', ensureAuth, (req, res) => {
  const type = req.query.type === 'digital' ? 'digital' : 'onsite';
  const step = parseInt(req.query.step || '1', 10);
  const profile = db.getWorkerProfileByUserId(req.session.userId);
  if (step === 1) return res.render('workers/register_step1', { title: 'Registrasi Worker 1', type, profile });
  if (step === 2) return res.render('workers/register_step2', { title: 'Registrasi Worker 2', type, profile });
  if (step === 3 && type === 'onsite') return res.render('workers/register_step3_onsite', { title: 'Wawancara On-site', type, profile });
  if (step === 3 && type === 'digital') return res.render('workers/register_step3_digital', { title: 'Sertifikat Digital', type, profile, certs: db.listCertificates(profile?.id || 0) });
  return res.render('workers/register_done', { title: 'Registrasi Selesai', type, profile });
});

router.post('/register/step1', ensureAuth, (req, res) => {
  const { type } = req.body;
  const payload = {
    type: type === 'digital' ? 'digital' : 'onsite',
    address: req.body.address || '',
    city: req.body.city || '',
    radius_km: parseInt(req.body.radius_km || '10', 10),
    skills_json: JSON.stringify((req.body.skills || '').split(',').map(s=>s.trim()).filter(Boolean)),
    experience_months: parseInt(req.body.experience_months || '0', 10),
  };
  db.upsertWorkerProfile(req.session.userId, payload);
  res.redirect(`/workers/register?type=${payload.type}&step=2`);
});

router.post('/register/step2', ensureAuth, upload.fields([
  { name:'ktp_photo', maxCount:1 },
  { name:'selfie_photo', maxCount:1 },
  { name:'skck_photo', maxCount:1 }
]), (req, res) => {
  const { type, ktp_number, bank_name, bank_account_number, bank_account_name, consent_bodycam } = req.body;
  const p = {
    type: type === 'digital' ? 'digital' : 'onsite',
    ktp_number,
    ktp_photo: req.files['ktp_photo'] ? '/uploads/' + req.files['ktp_photo'][0].filename : null,
    selfie_photo: req.files['selfie_photo'] ? '/uploads/' + req.files['selfie_photo'][0].filename : null,
    skck_photo: req.files['skck_photo'] ? '/uploads/' + req.files['skck_photo'][0].filename : null,
    bank_name, bank_account_number, bank_account_name,
    consent_bodycam: consent_bodycam ? 1 : 0,
    status: 'DOCS_SUBMITTED'
  };
  db.upsertWorkerProfile(req.session.userId, p);
  res.redirect(`/workers/register?type=${p.type}&step=3`);
});

router.post('/register/step3/onsite', ensureAuth, (req, res) => {
  const { slot_time } = req.body;
  const profile = db.getWorkerProfileByUserId(req.session.userId);
  if (!profile) return res.status(400).send('Profil tidak ditemukan');
  db.db.prepare('INSERT INTO interviews (worker_id, slot_time) VALUES (?,?)').run(profile.id, slot_time);
  db.db.prepare('UPDATE worker_profiles SET status=? WHERE id=?').run('INTERVIEW_SCHEDULED', profile.id);
  res.redirect('/workers/register?type=onsite&step=4');
});

router.post('/register/step3/digital', ensureAuth, (req, res) => {
  const profile = db.getWorkerProfileByUserId(req.session.userId);
  if (!profile) return res.status(400).send('Profil tidak ditemukan');
  const { issuer, cert_name, cert_id, verify_url, issued_at, expires_at } = req.body;
  db.addCertificate(profile.id, { issuer, cert_name, cert_id, verify_url, issued_at, expires_at });
  db.db.prepare('UPDATE worker_profiles SET status=? WHERE id=?').run('DOCS_SUBMITTED', profile.id);
  res.redirect('/workers/register?type=digital&step=3');
});

router.get('/me', ensureAuth, (req, res) => {
  const profile = db.getWorkerProfileByUserId(req.session.userId);
  const certs = profile ? db.listCertificates(profile.id) : [];
  res.render('workers/profile', { title: 'Profil Worker', profile, certs });
});

module.exports = router;
