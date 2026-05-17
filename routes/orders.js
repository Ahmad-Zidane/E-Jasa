
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

router.get('/new', ensureAuth, (req, res) => {
  const worker_id = parseInt(req.query.worker_id || '0', 10);
  const services = db.listServicesByCategory('onsite');
  res.render('orders/new_onsite', { title: 'Booking On-site', worker_id, services });
});

router.get('/new-digital', ensureAuth, (req, res) => {
  const worker_id = parseInt(req.query.worker_id || '0', 10);
  const services = db.listServicesByCategory('digital');
  res.render('orders/new_digital', { title: 'Booking Digital', worker_id, services });
});

router.post('/', ensureAuth, (req, res) => {
  const { worker_id, service_id, kind, schedule_at } = req.body;
  const service = db.getServiceById(parseInt(service_id,10));
  if (!service) return res.status(400).send('Service tidak valid');
  const order = db.createOrder({
    customer_id: req.session.userId,
    worker_id: parseInt(worker_id,10),
    service_id: service.id,
    schedule_at: schedule_at || null,
    kind: kind === 'digital' ? 'digital' : 'onsite',
    total: service.base_price,
  });
  res.redirect(`/orders/${order.id}`);
});

router.post('/:id/pay_simulate', ensureAuth, (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  const wp = db.getWorkerProfileByUserId(order.worker_id);
  db.markOrderPaid(id, wp?.status || 'TRIAL');
  if (order.kind === 'digital') db.createMilestonesForOrder(id, [30,40,30]);
  res.redirect(`/orders/${id}`);
});

// On-site proofs
router.post('/:id/checkin', ensureAuth, upload.single('media'), (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  if (order.worker_id !== req.session.userId) return res.status(403).send('Bukan order Anda.');
  const lat = parseFloat(req.body.lat || '0'), lng = parseFloat(req.body.lng || '0');
  const media = req.file ? '/uploads/' + req.file.filename : null;
  db.addProof(id, 'checkin', media, lat, lng);
  db.setOrderStatus(id, 'in_progress');
  res.redirect(`/orders/${id}`);
});
router.post('/:id/checkout', ensureAuth, upload.single('media'), (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  if (order.worker_id !== req.session.userId) return res.status(403).send('Bukan order Anda.');
  const lat = parseFloat(req.body.lat || '0'), lng = parseFloat(req.body.lng || '0');
  const media = req.file ? '/uploads/' + req.file.filename : null;
  db.addProof(id, 'checkout', media, lat, lng);
  res.redirect(`/orders/${id}`);
});

// Digital milestones
router.post('/:id/milestones/:mid/submit', ensureAuth, upload.single('delivery'), (req, res) => {
  const id = parseInt(req.params.id,10);
  const mid = parseInt(req.params.mid,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  if (order.worker_id !== req.session.userId) return res.status(403).send('Bukan order Anda.');
  const url = req.file ? '/uploads/' + req.file.filename : (req.body.delivery_url || '');
  db.submitMilestone(mid, url);
  db.addProof(id, 'delivery', url, null, null);
  res.redirect(`/orders/${id}`);
});
router.post('/:id/milestones/:mid/approve', ensureAuth, (req, res) => {
  const id = parseInt(req.params.id,10);
  const mid = parseInt(req.params.mid,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  if (order.customer_id !== req.session.userId) return res.status(403).send('Hanya customer.');
  db.approveMilestone(mid);
  const released = db.sumReleasedMilestones(id);
  if (released >= order.total) db.setOrderStatus(id, 'done');
  res.redirect(`/orders/${id}`);
});

// Complete onsite by customer
router.post('/:id/complete', ensureAuth, (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  if (order.customer_id !== req.session.userId) return res.status(403).send('Hanya customer.');
  db.setOrderStatus(id, 'done');
  res.redirect(`/orders/${id}`);
});

router.post('/:id/dispute', ensureAuth, (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  if (![order.customer_id, order.worker_id].includes(req.session.userId)) return res.status(403).send('Tidak berwenang.');
  db.addIncident(id, req.body.type || 'general', req.body.description || '');
  db.setOrderStatus(id, 'disputed');
  res.redirect(`/orders/${id}`);
});

router.get('/:id', ensureAuth, (req, res) => {
  const id = parseInt(req.params.id,10);
  const order = db.getOrder(id);
  if (!order) return res.status(404).send('Order tidak ditemukan');
  const proofs = db.listProofs(id);
  const milestones = (order.kind === 'digital') ? db.listMilestones(id) : [];
  res.render('orders/detail', { title: `Order #${order.id}`, order, proofs, milestones });
});

router.get('/', ensureAuth, (req, res) => {
  if (req.session.userRole === 'customer') {
    const list = db.listOrdersForCustomer(req.session.userId);
    return res.render('orders/customer_orders', { title: 'Order Saya', list });
  }
  if (req.session.userRole && req.session.userRole.startsWith('worker')) {
    const list = db.listOrdersForWorker(req.session.userId);
    return res.render('orders/worker_orders', { title: 'Order Saya', list });
  }
  res.redirect('/admin');
});

module.exports = router;
