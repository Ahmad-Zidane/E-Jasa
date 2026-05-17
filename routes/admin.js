
const express = require('express');
const router = express.Router();
const db = require('../db');
const { ensureAuth, ensureRole } = require('../middleware/auth');

router.use(ensureAuth, ensureRole('admin'));

router.get('/', (req, res) => {
  const docs = db.listPendingDocs();
  const certs = db.listPendingCertificates();
  const interviews = db.listScheduledInterviews();
  const incidents = db.listIncidents('open');
  res.render('admin/index', { title: 'Admin', docs, certs, interviews, incidents });
});

router.post('/workers/:profile_id/approve-docs', (req, res) => {
  db.db.prepare('UPDATE worker_profiles SET status=? WHERE id=?').run('E_KYC_PASSED', parseInt(req.params.profile_id,10));
  res.redirect('/admin');
});
router.post('/workers/:profile_id/set-trial', (req, res) => {
  db.db.prepare('UPDATE worker_profiles SET status=? WHERE id=?').run('TRIAL', parseInt(req.params.profile_id,10));
  res.redirect('/admin');
});
router.post('/certs/:id/verify', (req, res) => {
  db.updateCertificateStatus(parseInt(req.params.id,10), 'verified');
  res.redirect('/admin');
});
router.post('/certs/:id/reject', (req, res) => {
  db.updateCertificateStatus(parseInt(req.params.id,10), 'rejected');
  res.redirect('/admin');
});
router.post('/interviews/:id/result', (req, res) => {
  const id = parseInt(req.params.id,10);
  db.setInterviewResult(id, req.body.result, parseInt(req.body.score||'0',10), req.body.notes||'');
  res.redirect('/admin');
});
router.post('/incidents/:id/resolve', (req, res) => {
  const id = parseInt(req.params.id,10);
  db.db.prepare('UPDATE incidents SET status="resolved", resolved_at=datetime("now") WHERE id=?').run(id);
  res.redirect('/admin');
});
router.post('/orders/:id/release', (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (['disputed','paid','in_progress'].includes(order.status)) db.setOrderStatus(id, 'done');
  res.redirect('/admin');
});

module.exports = router;
