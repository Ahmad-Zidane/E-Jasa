
const db = require('./db');
const { hashPassword } = require('./utils/hash');

(async () => {
  db.init();
  // Admin
  if (!db.getUserByEmail('admin@demo.local')) {
    const pw = await hashPassword('admin123');
    db.createUser('admin', 'Admin', 'admin@demo.local', '081234567890', pw);
  }
  // Customers
  if (!db.getUserByEmail('budi@demo.local')) {
    const pw = await hashPassword('demo123');
    db.createUser('customer', 'Budi', 'budi@demo.local', '081111111111', pw);
  }
  if (!db.getUserByEmail('sari@demo.local')) {
    const pw = await hashPassword('demo123');
    db.createUser('customer', 'Sari', 'sari@demo.local', '082222222222', pw);
  }
  // Worker On-site
  if (!db.getUserByEmail('siti@demo.local')) {
    const pw = await hashPassword('demo123');
    const u = db.createUser('worker_onsite', 'Siti', 'siti@demo.local', '083333333333', pw);
    db.upsertWorkerProfile(u.id, {
      type: 'onsite', address: 'Jl. Melati No.1', city: 'Jakarta', radius_km: 10,
      skills_json: JSON.stringify(['Cleaning','Deep Clean']), experience_months: 18,
      consent_bodycam: 1, status: 'VERIFIED'
    });
  }
  if (!db.getUserByEmail('andi@demo.local')) {
    const pw = await hashPassword('demo123');
    const u = db.createUser('worker_onsite', 'Andi', 'andi@demo.local', '083444444444', pw);
    db.upsertWorkerProfile(u.id, {
      type: 'onsite', address: 'Jl. Kenanga No.2', city: 'Depok', radius_km: 15,
      skills_json: JSON.stringify(['Cleaning','Cuci AC']), experience_months: 6,
      consent_bodycam: 0, status: 'TRIAL'
    });
  }
  // Worker Digital
  if (!db.getUserByEmail('rafi@demo.local')) {
    const pw = await hashPassword('demo123');
    const u = db.createUser('worker_digital', 'Rafi', 'rafi@demo.local', '084555555555', pw);
    const prof = db.upsertWorkerProfile(u.id, {
      type: 'digital', address: 'Bandung', city: 'Bandung', radius_km: 0,
      skills_json: JSON.stringify(['Website','UI/UX','3D']), experience_months: 24,
      status: 'VERIFIED'
    });
    db.addCertificate(prof.id, { issuer: 'Dicoding', cert_name: 'Front-End Developer', cert_id: 'ABC123', verify_url: 'https://example.com/verify/ABC123', issued_at: '2024-01-10', expires_at: null });
    // verify certificate (use parameters to avoid quoting issues)
    const row = db.db.prepare('SELECT id FROM worker_certificates WHERE worker_id = ? ORDER BY id DESC LIMIT 1').get(prof.id);
    if (row) db.updateCertificateStatus(row.id, 'verified');
  }
  if (!db.getUserByEmail('nina@demo.local')) {
    const pw = await hashPassword('demo123');
    const u = db.createUser('worker_digital', 'Nina', 'nina@demo.local', '084666666666', pw);
    db.upsertWorkerProfile(u.id, {
      type: 'digital', address: 'Surabaya', city: 'Surabaya', radius_km: 0,
      skills_json: JSON.stringify(['UI/UX']), experience_months: 12,
      status: 'TRIAL'
    });
  }
  // Services On-site
  const onsite = [
    { name: 'Cleaning Basic (2 jam)', price: 200000, unit: 'flat', dur: 120 },
    { name: 'Cuci AC (1 unit)', price: 350000, unit: 'flat', dur: 90 },
    { name: 'Taman (2 jam)', price: 150000, unit: 'flat', dur: 120 },
    { name: 'Deep Clean (4 jam)', price: 400000, unit: 'flat', dur: 240 },
  ];
  onsite.forEach(s => {
    db.db.prepare('INSERT INTO services (category, name, description, base_price, unit, duration_minutes) VALUES (?,?,?,?,?,?)')
      .run('onsite', s.name, '', s.price, s.unit, s.dur);
  });
  // Services Digital
  const digital = [
    { name: 'Website Landing Page', price: 3000000 },
    { name: 'UI/UX High-Fidelity', price: 2500000 },
    { name: 'Aplikasi MVP (Android)', price: 5000000 },
    { name: 'Game Prototype (2D)', price: 2500000 },
    { name: '3D Modeling Basic', price: 2000000 },
  ];
  digital.forEach(s => {
    db.db.prepare('INSERT INTO services (category, name, description, base_price, unit, duration_minutes) VALUES (?,?,?,?,?,?)')
      .run('digital', s.name, '', s.price, 'flat', null);
  });

  console.log('Seed selesai');
  process.exit(0);
})();
