
const path = require('path');
const Database = require('better-sqlite3');
const dayjs = require('dayjs');

const db = new Database(path.join(__dirname, 'ejasa.db'));

function init() {
  db.pragma('journal_mode = WAL');
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('customer','worker_onsite','worker_digital','admin')),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS worker_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('onsite','digital')),
    address TEXT, city TEXT, radius_km INTEGER,
    skills_json TEXT, experience_months INTEGER,
    bank_name TEXT, bank_account_number TEXT, bank_account_name TEXT,
    ktp_number TEXT, ktp_photo TEXT, selfie_photo TEXT, skck_photo TEXT,
    referred_by_foundation TEXT,
    consent_bodycam INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'NEW',
    interview_score INTEGER, interview_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS worker_certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL,
    issuer TEXT NOT NULL, cert_name TEXT NOT NULL, cert_id TEXT, verify_url TEXT,
    issued_at TEXT, expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(worker_id) REFERENCES worker_profiles(id)
  );
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('onsite','digital')),
    name TEXT NOT NULL,
    description TEXT,
    base_price INTEGER NOT NULL,
    unit TEXT NOT NULL,
    duration_minutes INTEGER,
    metadata_json TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    worker_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    schedule_at TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('onsite','digital')),
    status TEXT NOT NULL DEFAULT 'pending',
    total INTEGER NOT NULL,
    platform_fee INTEGER NOT NULL DEFAULT 0,
    worker_payout INTEGER NOT NULL DEFAULT 0,
    hold_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES users(id),
    FOREIGN KEY(worker_id) REFERENCES users(id),
    FOREIGN KEY(service_id) REFERENCES services(id)
  );
  CREATE TABLE IF NOT EXISTS order_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    delivery_url TEXT,
    submitted_at TEXT, approved_at TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
  CREATE TABLE IF NOT EXISTS proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    media_path TEXT,
    lat REAL, lng REAL,
    captured_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
  CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL,
    slot_time TEXT NOT NULL,
    score_total INTEGER,
    notes TEXT,
    result TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(worker_id) REFERENCES worker_profiles(id)
  );
  `);
}

function getUserByEmail(email){ return db.prepare('SELECT * FROM users WHERE email = ?').get(email); }
function getUserById(id){ return db.prepare('SELECT * FROM users WHERE id = ?').get(id); }
function createUser(role, name, email, phone, password_hash){
  const info = db.prepare('INSERT INTO users (role, name, email, phone, password_hash) VALUES (?,?,?,?,?)')
    .run(role, name, email, phone, password_hash);
  return getUserById(info.lastInsertRowid);
}

function upsertWorkerProfile(user_id, payload){
  const existing = db.prepare('SELECT * FROM worker_profiles WHERE user_id = ?').get(user_id);
  if (!existing) {
    const cols = ['user_id','type'].concat(Object.keys(payload));
    const placeholders = cols.map(()=>'?').join(',');
    const values = [user_id, payload.type].concat(Object.keys(payload).map(k=>payload[k]));
    db.prepare(`INSERT INTO worker_profiles (${cols.join(',')}) VALUES (${placeholders})`).run(...values);
  } else {
    const set = Object.keys(payload).map(k=>`${k}=?`).join(', ');
    db.prepare(`UPDATE worker_profiles SET ${set} WHERE user_id = ?`).run(...Object.keys(payload).map(k=>payload[k]), user_id);
  }
  return db.prepare('SELECT * FROM worker_profiles WHERE user_id = ?').get(user_id);
}
function getWorkerProfileByUserId(user_id){ return db.prepare('SELECT * FROM worker_profiles WHERE user_id = ?').get(user_id); }
function listCertificates(worker_profile_id){ return db.prepare('SELECT * FROM worker_certificates WHERE worker_id = ?').all(worker_profile_id); }
function addCertificate(worker_profile_id, c){
  db.prepare(`INSERT INTO worker_certificates (worker_id, issuer, cert_name, cert_id, verify_url, issued_at, expires_at, status) VALUES (?,?,?,?,?,?,?,?)`)
    .run(worker_profile_id, c.issuer, c.cert_name, c.cert_id, c.verify_url, c.issued_at, c.expires_at, 'pending');
}
function updateCertificateStatus(id, status){
  db.prepare('UPDATE worker_certificates SET status = ? WHERE id = ?').run(status, id);
}

function listWorkers(category, opts={}){
  const bodycam = !!opts.bodycam;
  const certifiedOnly = !!opts.certifiedOnly;
  let where = 'WHERE u.role IN ("worker_onsite","worker_digital") AND wp.type = ? AND wp.status IN ("TRIAL","VERIFIED")';
  const params = [category];
  if (category==='onsite' && bodycam) where += ' AND wp.consent_bodycam = 1';
  if (category==='digital' && certifiedOnly) where += " AND EXISTS (SELECT 1 FROM worker_certificates wc WHERE wc.worker_id = wp.id AND wc.status = 'verified')";
  const sql = `SELECT u.id as user_id, u.name, u.email, wp.*, 
               (SELECT COUNT(*) FROM worker_certificates wc WHERE wc.worker_id = wp.id AND wc.status='verified') as cert_count
               FROM users u JOIN worker_profiles wp ON wp.user_id = u.id ${where}
               ORDER BY cert_count DESC, u.name ASC`;
  return db.prepare(sql).all(...params);
}

function listServicesByCategory(category){
  return db.prepare('SELECT * FROM services WHERE category = ? ORDER BY name').all(category);
}
function getServiceById(id){ return db.prepare('SELECT * FROM services WHERE id = ?').get(id); }

function computeFees(total){ const platform_fee = Math.round(total*0.10); return { platform_fee, worker_payout: total - platform_fee }; }

function createOrder(p){
  const fees = computeFees(p.total);
  const info = db.prepare(`INSERT INTO orders (customer_id, worker_id, service_id, schedule_at, kind, status, total, platform_fee, worker_payout) 
                           VALUES (?,?,?,?,?,'pending',?,?,?)`)
    .run(p.customer_id, p.worker_id, p.service_id, p.schedule_at, p.kind, p.total, fees.platform_fee, fees.worker_payout);
  return getOrder(info.lastInsertRowid);
}
function getOrder(id){
  const sql = `SELECT o.*, s.name AS service_name, s.category AS service_category, 
               cu.name AS customer_name, wu.name AS worker_name
               FROM orders o
               JOIN services s ON s.id = o.service_id
               JOIN users cu ON cu.id = o.customer_id
               JOIN users wu ON wu.id = o.worker_id
               WHERE o.id = ?`;
  return db.prepare(sql).get(id);
}
function listOrdersForCustomer(id){ 
  return db.prepare(`SELECT o.*, s.name as service_name FROM orders o JOIN services s ON s.id=o.service_id WHERE customer_id = ? ORDER BY o.created_at DESC`).all(id);
}
function listOrdersForWorker(id){ 
  return db.prepare(`SELECT o.*, s.name as service_name FROM orders o JOIN services s ON s.id=o.service_id WHERE worker_id = ? ORDER BY o.created_at DESC`).all(id);
}

function markOrderPaid(id, worker_status){
  let hold_until = null;
  if (worker_status === 'TRIAL') hold_until = dayjs().add(2,'day').toISOString();
  db.prepare('UPDATE orders SET status = ?, hold_until = ? WHERE id = ?').run('paid', hold_until, id);
  return getOrder(id);
}
function setOrderStatus(id, status){
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  return getOrder(id);
}

function addProof(order_id, type, media_path, lat, lng){
  db.prepare('INSERT INTO proofs (order_id, type, media_path, lat, lng) VALUES (?,?,?,?,?)').run(order_id, type, media_path, lat, lng);
}
function listProofs(order_id){ return db.prepare('SELECT * FROM proofs WHERE order_id = ? ORDER BY captured_at').all(order_id); }

function createMilestonesForOrder(order_id, parts=[30,40,30]){
  const order = getOrder(order_id); if (!order) return;
  const row = db.prepare('SELECT COUNT(*) as c FROM order_milestones WHERE order_id = ?').get(order_id);
  if (row.c > 0) return;
  const names = ['Milestone 1','Milestone 2','Milestone 3'];
  parts.forEach((pct, i)=>{
    const amount = Math.round(order.total * (pct/100));
    db.prepare('INSERT INTO order_milestones (order_id, name, amount, status) VALUES (?,?,?,?)').run(order_id, names[i]||`Milestone ${i+1}`, amount, 'pending');
  });
}
function listMilestones(order_id){ return db.prepare('SELECT * FROM order_milestones WHERE order_id = ? ORDER BY id').all(order_id); }
function submitMilestone(mid, url){ db.prepare('UPDATE order_milestones SET status=?, delivery_url=?, submitted_at=datetime("now") WHERE id=?').run('submitted', url, mid); }
function approveMilestone(mid){ db.prepare('UPDATE order_milestones SET status=?, approved_at=datetime("now") WHERE id=?').run('released', mid); }
function sumReleasedMilestones(order_id){
  const row = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM order_milestones WHERE order_id=? AND status="released"').get(order_id);
  return row.t || 0;
}

function addIncident(order_id, type, description){
  db.prepare('INSERT INTO incidents (order_id, type, description, status) VALUES (?,?,?,?)').run(order_id, type, description, 'open');
}
function listIncidents(status='open'){ return db.prepare('SELECT * FROM incidents WHERE status = ? ORDER BY created_at DESC').all(status); }

function listPendingDocs(){
  return db.prepare(`SELECT u.id as user_id, u.name, u.email, wp.* FROM worker_profiles wp 
                     JOIN users u ON u.id = wp.user_id WHERE wp.status = 'DOCS_SUBMITTED'`).all();
}
function listPendingCertificates(){
  return db.prepare(`SELECT wc.*, u.name as worker_name FROM worker_certificates wc 
                     JOIN worker_profiles wp ON wp.id = wc.worker_id 
                     JOIN users u ON u.id = wp.user_id WHERE wc.status = 'pending'`).all();
}
function listScheduledInterviews(){
  return db.prepare(`SELECT i.*, u.name as worker_name FROM interviews i
                     JOIN worker_profiles wp ON wp.id = i.worker_id
                     JOIN users u ON u.id = wp.user_id WHERE i.result='pending'`).all();
}
function setInterviewResult(interview_id, result, score, notes){
  db.prepare('UPDATE interviews SET result=?, score_total=?, notes=? WHERE id=?').run(result, score, notes, interview_id);
  const iv = db.prepare('SELECT * FROM interviews WHERE id = ?').get(interview_id);
  if (iv && result === 'pass') db.prepare('UPDATE worker_profiles SET status=? WHERE id=?').run('TRIAL', iv.worker_id);
  if (iv && result === 'fail') db.prepare('UPDATE worker_profiles SET status=? WHERE id=?').run('SUSPENDED', iv.worker_id);
}

module.exports = {
  db, init,
  getUserByEmail, getUserById, createUser,
  upsertWorkerProfile, getWorkerProfileByUserId, listCertificates, addCertificate, updateCertificateStatus,
  listWorkers, listServicesByCategory, getServiceById,
  computeFees, createOrder, getOrder, listOrdersForCustomer, listOrdersForWorker,
  markOrderPaid, setOrderStatus,
  createMilestonesForOrder, listMilestones, submitMilestone, approveMilestone, sumReleasedMilestones,
  addProof, listProofs,
  addIncident, listIncidents, listPendingDocs, listPendingCertificates, listScheduledInterviews, setInterviewResult
};
