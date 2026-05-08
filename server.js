require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'boybak-db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const INITIAL_STATE_FILE = path.join(DATA_DIR, 'boybak-db-initial-state.json');
const INITIAL_USERS_FILE = path.join(DATA_DIR, 'boybak-users-initial.json');

const DEFAULT_STATE = { products: [], colors: [], holidays: [], plans: [], finishedArchives: [], settings: {} };
const DEFAULT_USERS = [
  { username: 'admin', password: process.env.ADMIN_PASSWORD || '1234', role: 'admin', label: 'Admin', permissions: ['*'] },
  { username: 'kullanici', password: '1234', role: 'user', label: 'Kullanıcı', permissions: ['dashboard', 'plan'] }
];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const MYSQL_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'u597488761_boybak',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'u597488761_boybakplastik',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};
const USE_MYSQL = Boolean(process.env.DB_PASSWORD);
let pool = null;

app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
  next();
});

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('JSON okunamadı:', file, err.message);
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function initialDb() {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: readJsonSafe(INITIAL_STATE_FILE, DEFAULT_STATE),
    users: readJsonSafe(INITIAL_USERS_FILE, DEFAULT_USERS),
    audit: []
  };
}

function normalizeDb(data) {
  data = data || initialDb();
  data.state = { ...DEFAULT_STATE, ...(data.state || {}) };
  if (Array.isArray(data.state.products)) {
    data.state.products = data.state.products.map(p => ({
      ...p,
      boya_kodu: String(p.boya_kodu || p.boyaKodu || p['Boya Kodu'] || p.boya || '').trim()
    }));
  }
  data.users = Array.isArray(data.users) && data.users.length ? data.users : DEFAULT_USERS;
  data.audit = Array.isArray(data.audit) ? data.audit : [];
  data.updatedAt = data.updatedAt || new Date().toISOString();
  return data;
}

async function initMysql() {
  if (!USE_MYSQL) {
    console.warn('DB_PASSWORD boş olduğu için JSON dosya modu kullanılacak. Hostinger Ortam Değişkenleri içine DB_PASSWORD ekleyin.');
    return;
  }
  pool = mysql.createPool(MYSQL_CONFIG);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_store (
    store_key VARCHAR(64) PRIMARY KEY,
    store_value LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_backups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reason VARCHAR(50) NOT NULL DEFAULT 'manual',
    payload LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [rows] = await pool.query('SELECT store_value FROM app_store WHERE store_key=?', ['db']);
  if (!rows.length) {
    await pool.query('INSERT INTO app_store (store_key, store_value) VALUES (?,?)', ['db', JSON.stringify(initialDb())]);
  }
  console.log('MySQL bağlantısı hazır:', MYSQL_CONFIG.database);
}

async function getDb() {
  if (pool) {
    const [rows] = await pool.query('SELECT store_value FROM app_store WHERE store_key=?', ['db']);
    if (!rows.length) return initialDb();
    return normalizeDb(JSON.parse(rows[0].store_value));
  }
  if (!fs.existsSync(DB_FILE)) writeJsonAtomic(DB_FILE, initialDb());
  return normalizeDb(readJsonSafe(DB_FILE, initialDb()));
}

async function saveDb(data) {
  data = normalizeDb(data);
  data.updatedAt = new Date().toISOString();
  if (pool) {
    await pool.query(
      'INSERT INTO app_store (store_key, store_value) VALUES (?,?) ON DUPLICATE KEY UPDATE store_value=VALUES(store_value)',
      ['db', JSON.stringify(data)]
    );
    return;
  }
  writeJsonAtomic(DB_FILE, data);
}

async function createBackup(reason = 'manual') {
  const data = await getDb();
  if (pool) {
    const [result] = await pool.query('INSERT INTO app_backups (reason, payload) VALUES (?,?)', [reason, JSON.stringify(data)]);
    return { id: result.insertId, createdAt: new Date().toISOString(), reason };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `boybak-backup-${stamp}-${reason}.json`);
  writeJsonAtomic(file, data);
  return { file: path.basename(file), createdAt: new Date().toISOString(), reason };
}

async function cleanupBackups(maxCount = 60) {
  if (pool) {
    await pool.query(`DELETE FROM app_backups WHERE id NOT IN (
      SELECT id FROM (SELECT id FROM app_backups ORDER BY created_at DESC LIMIT ?) AS keep_rows
    )`, [maxCount]);
    return;
  }
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  files.slice(maxCount).forEach(x => fs.unlinkSync(path.join(BACKUP_DIR, x.f)));
}

setInterval(() => {
  createBackup('auto').then(() => cleanupBackups(60)).catch(err => console.error('Otomatik yedek alınamadı:', err.message));
}, 1000 * 60 * 60 * 12);

app.get('/health', async (req, res) => {
  try {
    if (pool) await pool.query('SELECT 1');
    res.json({ ok: true, db: pool ? 'mysql' : 'json', time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/api/state', async (req, res) => res.json((await getDb()).state));
app.post('/api/state', async (req, res) => {
  const data = await getDb();
  data.state = { ...DEFAULT_STATE, ...(req.body || {}) };
  await saveDb(data);
  res.json({ ok: true, updatedAt: data.updatedAt });
});
app.get('/api/users', async (req, res) => res.json((await getDb()).users));
app.post('/api/users', async (req, res) => {
  const data = await getDb();
  data.users = Array.isArray(req.body) ? req.body : data.users;
  await saveDb(data);
  res.json({ ok: true, users: data.users.length });
});
app.post('/api/backup', async (req, res) => {
  try { res.json({ ok: true, backup: await createBackup('manual') }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
app.get('/api/backup/download', async (req, res) => {
  try {
    const data = await getDb();
    const stamp = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=boybak-yedek-${stamp}.json`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/api/backups', async (req, res) => {
  if (pool) {
    const [rows] = await pool.query('SELECT id, reason, created_at FROM app_backups ORDER BY created_at DESC LIMIT 100');
    return res.json(rows.map(r => ({ id: r.id, reason: r.reason, updatedAt: r.created_at })));
  }
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, size: stat.size, updatedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json(backups);
});

app.use(express.static(PUBLIC_DIR, { maxAge: '1h', etag: true }));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

initMysql()
  .then(() => app.listen(PORT, HOST, () => {
    console.log(`Boybak Üretim Planlama çalışıyor: http://${HOST}:${PORT} / DB: ${pool ? 'MySQL' : 'JSON'}`);
  }))
  .catch(err => {
    console.error('Sunucu başlatılamadı:', err);
    process.exit(1);
  });
