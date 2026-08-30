import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || 'development-only-secret-change-me';
const db = new DatabaseSync(fileURLToPath(new URL('./tasks.db', import.meta.url)));
const run = async (sql, params = []) => db.prepare(sql).run(...params);
const get = async (sql, params = []) => db.prepare(sql).get(...params);
const all = async (sql, params = []) => db.prepare(sql).all(...params);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '20kb' }));

await run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
await run(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL,
  description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

const tokenFor = (user) => jwt.sign({ id: user.id, name: user.name, email: user.email }, SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
};
const validateTask = ({ title, status, dueDate }) => {
  if (!title?.trim() || title.trim().length > 120) return 'Task title is required and must be 120 characters or fewer.';
  if (status && !['pending', 'in-progress', 'done'].includes(status)) return 'Choose a valid task status.';
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'Use a valid due date.';
};

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const { name = '', email = '', password = '' } = req.body;
    if (name.trim().length < 2 || name.trim().length > 50) return res.status(400).json({ message: 'Name must be 2-50 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name.trim(), email.toLowerCase(), passwordHash]);
    const user = { id: Number(result.lastInsertRowid), name: name.trim(), email: email.toLowerCase() };
    res.status(201).json({ token: tokenFor(user), user });
  } catch (error) { if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ message: 'An account with that email already exists.' }); next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [req.body.email?.toLowerCase()]);
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ message: 'Incorrect email or password.' });
    res.json({ token: tokenFor(user), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { next(error); }
});
app.get('/api/tasks', auth, async (req, res, next) => { try { res.json(await all('SELECT * FROM tasks WHERE user_id = ? ORDER BY CASE status WHEN \'in-progress\' THEN 1 WHEN \'pending\' THEN 2 ELSE 3 END, due_date IS NULL, due_date, created_at DESC', [req.user.id])); } catch (e) { next(e); } });
app.post('/api/tasks', auth, async (req, res, next) => {
  try { const error = validateTask(req.body); if (error) return res.status(400).json({ message: error }); const { title, description = '', status = 'pending', dueDate = null } = req.body; const result = await run('INSERT INTO tasks (user_id, title, description, status, due_date) VALUES (?, ?, ?, ?, ?)', [req.user.id, title.trim(), description.trim(), status, dueDate || null]); res.status(201).json(await get('SELECT * FROM tasks WHERE id = ?', [Number(result.lastInsertRowid)])); } catch (e) { next(e); }
});
app.put('/api/tasks/:id', auth, async (req, res, next) => {
  try { const error = validateTask(req.body); if (error) return res.status(400).json({ message: error }); const { title, description = '', status = 'pending', dueDate = null } = req.body; const result = await run('UPDATE tasks SET title=?, description=?, status=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?', [title.trim(), description.trim(), status, dueDate || null, req.params.id, req.user.id]); if (!result.changes) return res.status(404).json({ message: 'Task not found.' }); res.json(await get('SELECT * FROM tasks WHERE id = ?', [req.params.id])); } catch (e) { next(e); }
});
app.patch('/api/tasks/:id/status', auth, async (req, res, next) => { try { const { status } = req.body; if (!['pending', 'in-progress', 'done'].includes(status)) return res.status(400).json({ message: 'Choose a valid task status.' }); const result = await run('UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?', [status, req.params.id, req.user.id]); if (!result.changes) return res.status(404).json({ message: 'Task not found.' }); res.json(await get('SELECT * FROM tasks WHERE id = ?', [req.params.id])); } catch (e) { next(e); } });
app.delete('/api/tasks/:id', auth, async (req, res, next) => { try { const result = await run('DELETE FROM tasks WHERE id=? AND user_id=?', [req.params.id, req.user.id]); if (!result.changes) return res.status(404).json({ message: 'Task not found.' }); res.status(204).end(); } catch (e) { next(e); } });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: 'Something went wrong. Please try again.' }); });
app.listen(PORT, () => console.log(`FocusFlow API listening on http://localhost:${PORT}`));
