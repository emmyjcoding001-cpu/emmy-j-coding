import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import session from 'express-session'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

const app = express()
const port = process.env.PORT || 4000
const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const publicDatabaseUrl = process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL
const databaseConfig = publicDatabaseUrl ? publicDatabaseUrl : { host: process.env.MYSQL_HOST || process.env.MYSQLHOST, port: process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306, database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE, user: process.env.MYSQL_USER || process.env.MYSQLUSER, password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD }
const pool = typeof databaseConfig === 'string'
	? mysql.createPool(databaseConfig)
	: mysql.createPool({ ...databaseConfig, waitForConnections: true, connectionLimit: 10 })
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())
app.use(session({ secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'change-this-session-secret', resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 } }))
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((user, done) => done(null, user.id))
passport.deserializeUser(async (id, done) => { try { const [rows] = await pool.execute('SELECT id, username, email, avatar_url AS avatarUrl FROM users WHERE id = ?', [id]); done(null, rows[0] || false) } catch (error) { done(error) } })
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) passport.use(new GoogleStrategy({ clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: `${process.env.APP_URL || 'http://localhost:4000'}/api/auth/google/callback` }, async (_accessToken, _refreshToken, profile, done) => { try { const email = profile.emails?.[0]?.value; if (!email) return done(new Error('Google account did not provide an email')); const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]); if (existing[0]) return done(null, { id: existing[0].id }); const [result] = await pool.execute('INSERT INTO users (username, email, password_hash, avatar_url, auth_provider) VALUES (?, ?, NULL, ?, ?)', [profile.displayName || email.split('@')[0], email, profile.photos?.[0]?.value || null, 'google']); done(null, { id: result.insertId }) } catch (error) { done(error) } }))
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: true }))
app.get('/api/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?auth=failed', session: true }), (_req, res) => res.redirect('/?auth=success'))
app.get('/api/auth/me', (req, res) => res.json({ authenticated: req.isAuthenticated(), user: req.user || null }))
app.post('/api/auth/logout', (req, res) => req.logout((error) => { if (error) return res.status(500).json({ error: 'Could not sign out' }); res.json({ ok: true }) }))
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
