
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const category = (req.query.category === 'digital') ? 'digital' : 'onsite';
  const certifiedOnly = req.query.certified === 'true';
  const bodycam = req.query.bodycam === 'true';
  const workers = db.listWorkers(category, { certifiedOnly, bodycam });
  const services = db.listServicesByCategory(category);
  res.render('marketplace/index', { title: 'Marketplace', category, workers, services, certifiedOnly, bodycam });
});

module.exports = router;
