import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = process.env.PORT || 4000
const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const pool = mysql.createPool({ host: process.env.MYSQL_HOST, port: process.env.MYSQL_PORT || 3306, database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, waitForConnections: true, connectionLimit: 10 })
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())
app.get('/api/contact', (_req, res) => res.json({ whatsapp: process.env.ADMIN_WHATSAPP || '08052586788' }))
app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }) } catch { res.status(503).json({ ok: false, database: 'unavailable', message: 'Set MySQL variables in .env' }) } })
app.post('/api/projects', async (req, res) => { const { name, websiteType, brief, contactName, contactEmail, contactPhone } = req.body; if (!name || !websiteType || !contactEmail) return res.status(400).json({ error: 'name, websiteType, and contactEmail are required' }); const connection = await pool.getConnection(); try { await connection.beginTransaction(); const [result] = await connection.execute('INSERT INTO projects (name, website_type, brief, contact_name, contact_email, contact_phone, status, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [name, websiteType, brief || '', contactName || '', contactEmail, contactPhone || '', 'Brief received', 8]); await connection.execute('INSERT INTO booking_requests (project_id, contact_name, contact_email, contact_phone) VALUES (?, ?, ?, ?)', [result.insertId, contactName || '', contactEmail, contactPhone || '']); await connection.commit(); res.status(201).json({ id: result.insertId, name, websiteType, progress: 8, status: 'Brief received' }) } catch (error) { await connection.rollback(); res.status(500).json({ error: 'Could not create project', detail: error.message }) } finally { connection.release() } })
app.get('/api/projects', async (_req, res) => { try { const [rows] = await pool.query('SELECT id, name, website_type AS websiteType, status, progress, created_at AS createdAt FROM projects ORDER BY created_at DESC'); res.json(rows) } catch (error) { res.status(500).json({ error: 'Could not load projects', detail: error.message }) } })
app.get('/api/admin/contacts', async (_req, res) => { try { const [rows] = await pool.query('SELECT id, name, contact_name AS contactName, contact_email AS contactEmail, contact_phone AS contactPhone, website_type AS websiteType, status, created_at AS createdAt FROM projects ORDER BY created_at DESC'); res.json(rows) } catch (error) { res.status(500).json({ error: 'Could not load client contacts', detail: error.message }) } })
const purgeExpiredBookings = () => pool.query('DELETE FROM booking_requests WHERE submitted_at < (NOW() - INTERVAL 24 HOUR)').catch((error) => console.error('Booking cleanup skipped:', error.message))
setInterval(purgeExpiredBookings, 60 * 60 * 1000)
purgeExpiredBookings()
app.use(express.static(distPath))
app.use((req, res, next) => { if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(distPath, 'index.html')); next() })
app.listen(port, () => console.log(`Emmy J API listening on port ${port}`))
