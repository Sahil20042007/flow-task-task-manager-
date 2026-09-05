import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Add it to server/.env locally or Vercel environment variables.');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Add it to server/.env locally or Vercel environment variables.');

const app = express();
const sql = neon(process.env.DATABASE_URL);
const query = (text, params = []) => sql(text, params);
const get = async (text, params = []) => (await query(text, params))[0];
const all = (text, params = []) => query(text, params);
let initialization;
const initializeDatabase = () => initialization ??= Promise.all([
  query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL, email VARCHAR(254) UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
  query(`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title VARCHAR(120) NOT NULL, description VARCHAR(500) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'done')), due_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
]);

app.use(cors());
app.use(express.json({ limit: '20kb' }));
app.use(async (_req, _res, next) => { try { await initializeDatabase(); next(); } catch (error) { next(error); } });

const tokenFor = (user) => jwt.sign({ id: user.id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => { const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) return res.status(401).json({ message: 'Authentication required.' }); try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); } catch { return res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); } };
const validateTask = ({ title, status, dueDate }) => { if (!title?.trim() || title.trim().length > 120) return 'Task title is required and must be 120 characters or fewer.'; if (status && !['pending', 'in-progress', 'done'].includes(status)) return 'Choose a valid task status.'; if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'Use a valid due date.'; };

app.post('/api/auth/signup', async (req, res, next) => { try { const { name = '', email = '', password = '' } = req.body; if (name.trim().length < 2 || name.trim().length > 50) return res.status(400).json({ message: 'Name must be 2-50 characters.' }); if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' }); if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' }); const passwordHash = await bcrypt.hash(password, 12); const user = await get('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email', [name.trim(), email.toLowerCase(), passwordHash]); res.status(201).json({ token: tokenFor(user), user }); } catch (error) { if (error.code === '23505') return res.status(409).json({ message: 'An account with that email already exists.' }); next(error); } });
app.post('/api/auth/login', async (req, res, next) => { try { const user = await get('SELECT * FROM users WHERE email = $1', [req.body.email?.toLowerCase()]); if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ message: 'Incorrect email or password.' }); res.json({ token: tokenFor(user), user: { id: user.id, name: user.name, email: user.email } }); } catch (error) { next(error); } });
app.get('/api/tasks', auth, async (req, res, next) => { try { res.json(await all(`SELECT * FROM tasks WHERE user_id = $1 ORDER BY CASE status WHEN 'in-progress' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, due_date NULLS LAST, created_at DESC`, [req.user.id])); } catch (error) { next(error); } });
app.post('/api/tasks', auth, async (req, res, next) => { try { const error = validateTask(req.body); if (error) return res.status(400).json({ message: error }); const { title, description = '', status = 'pending', dueDate = null } = req.body; const task = await get('INSERT INTO tasks (user_id, title, description, status, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *', [req.user.id, title.trim(), description.trim(), status, dueDate || null]); res.status(201).json(task); } catch (error) { next(error); } });
app.put('/api/tasks/:id', auth, async (req, res, next) => { try { const error = validateTask(req.body); if (error) return res.status(400).json({ message: error }); const { title, description = '', status = 'pending', dueDate = null } = req.body; const task = await get('UPDATE tasks SET title=$1, description=$2, status=$3, due_date=$4, updated_at=NOW() WHERE id=$5 AND user_id=$6 RETURNING *', [title.trim(), description.trim(), status, dueDate || null, req.params.id, req.user.id]); if (!task) return res.status(404).json({ message: 'Task not found.' }); res.json(task); } catch (error) { next(error); } });
app.patch('/api/tasks/:id/status', auth, async (req, res, next) => { try { const { status } = req.body; if (!['pending', 'in-progress', 'done'].includes(status)) return res.status(400).json({ message: 'Choose a valid task status.' }); const task = await get('UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *', [status, req.params.id, req.user.id]); if (!task) return res.status(404).json({ message: 'Task not found.' }); res.json(task); } catch (error) { next(error); } });
app.delete('/api/tasks/:id', auth, async (req, res, next) => { try { const task = await get('DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]); if (!task) return res.status(404).json({ message: 'Task not found.' }); res.status(204).end(); } catch (error) { next(error); } });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: 'Something went wrong. Please try again.' }); });

export default app;
