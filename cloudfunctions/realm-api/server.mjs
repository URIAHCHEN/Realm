// Realm 学情系统 · CloudBase 边缘服务
//
// 单函数同时承担三件事：
//   1) 静态资源：把构建产物 dist/ 直接对外提供（替代静态托管入口）
//   2) 鉴权：/api/auth/v1/* 兼容前端既有的 GoTrue 调用形态（邮箱 + 口令）
//   3) 数据：/api/rest/v1/* 校验登录态与成员权限后，转发到 CloudBase PG 的 PostgREST 网关
//
// 设计约束：
//   · 浏览器永远拿不到数据库密钥；service_role 的 API Key 只存在于函数环境变量里
//   · 函数不直连数据库（不建 TCP 连接、不用 pg 驱动），一律走官方网关 /v1/rdb/rest
//   · 全部逻辑无第三方依赖，Node 20 内置能力足够（crypto / fetch / fs）

import http from 'node:http'
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')

const ENV_ID = process.env.TCB_ENV_ID || ''
const API_KEY = process.env.TCB_API_KEY || ''
const JWT_SECRET = process.env.JWT_SECRET || ''
const PG_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`

const ACCESS_TTL = 60 * 60           // 访问令牌 1 小时（前端提前 5 分钟刷新）
const REFRESH_TTL = 60 * 60 * 24 * 30 // 刷新令牌 30 天
const MAX_BODY = 64 * 1024 * 1024

// ---------- 基础工具 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function jsonBody(req) {
  const raw = await readBody(req)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---------- 口令与令牌 ----------

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}


/** 无邮件服务时的找回密码：管理员生成 8 位短码，10 分钟一个时间桶，接受当前与上一桶 */
function resetCode(email, bucket) {
  return createHmac('sha256', JWT_SECRET || 'realm-reset')
    .update(`reset|${email}|${bucket}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const actual = scryptSync(password, salt, expected.length)
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function verifyToken(token) {
  if (!token || !JWT_SECRET) return null
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const expect = createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  const a = Buffer.from(expect)
  const b = Buffer.from(parts[2])
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ---------- PG 访问（网关 PostgREST） ----------

async function pg(query, init = {}) {
  const url = `${PG_BASE}${query}`
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  }
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: res.status, ok: res.ok, data, text }
}

/** 取某团队码（scope）的名册；scope 与 app_state.id 一致 */
async function listMembers(scope) {
  const r = await pg(`/app_members?scope=eq.${encodeURIComponent(scope)}&select=user_id,is_admin`)
  if (!r.ok || !Array.isArray(r.data)) throw new Error('MEMBERS_LOOKUP_FAILED')
  return r.data
}

/**
 * 写权限判定（与迁移前 Supabase 的 RLS 语义保持一致）：
 *   · 该 scope 还没有任何成员 → 允许（首个账号自举为管理员）
 *   · 调用者在该 scope 是管理员 → 允许
 *   · needAdmin=true 时要求管理员，否则只要求是成员
 */
async function canWrite(scope, uid, needAdmin) {
  if (!scope || !uid) return { ok: false, reason: '缺少范围或身份' }
  const members = await listMembers(scope)
  if (members.length === 0) return { ok: true, bootstrap: true }
  const mine = members.find((m) => m.user_id === uid)
  if (!mine) return { ok: false, reason: '尚未被加入可写名单' }
  if (needAdmin && !mine.is_admin) return { ok: false, reason: '需要管理员权限' }
  return { ok: true }
}

// 从查询串里取 `field=eq.value`
function eqValue(search, field) {
  const m = new RegExp(`[?&]${field}=eq\\.([^&]*)`).exec(search)
  return m ? decodeURIComponent(m[1]) : ''
}

// ---------- 鉴权接口（兼容 GoTrue 形态） ----------

async function issueSession(user) {
  const now = Math.floor(Date.now() / 1000)
  const expires_at = now + ACCESS_TTL
  const access_token = signToken({ sub: user.id, email: user.email, iat: now, exp: expires_at })
  const refresh_token = randomBytes(32).toString('hex')
  const refreshExp = new Date((now + REFRESH_TTL) * 1000).toISOString()
  const ins = await pg('/app_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ refresh_token, user_id: user.id, expires_at: refreshExp }),
  })
  if (!ins.ok) throw new Error(`会话写入失败: ${ins.text.slice(0, 200)}`)
  return {
    access_token,
    refresh_token,
    expires_at,
    token_type: 'bearer',
    user: { id: user.id, email: user.email },
  }
}

async function handleAuth(req, res, pathname, search) {
  // 注册
  if (pathname.endsWith('/signup')) {
    const body = await jsonBody(req)
    if (!body) return sendJson(res, 400, { error_description: '请求体格式错误' })
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!email.includes('@')) return sendJson(res, 400, { error_description: '邮箱格式不正确' })
    if (password.length < 6) return sendJson(res, 400, { error_description: 'Password should be at least 6 characters' })

    const exists = await pg(`/app_users?email=eq.${encodeURIComponent(email)}&select=id`)
    if (!exists.ok) return sendJson(res, 502, { error_description: '数据库暂时不可用' })
    if (Array.isArray(exists.data) && exists.data.length > 0) {
      return sendJson(res, 400, { error_description: 'User already registered' })
    }
    const user = { id: randomUUID(), email }
    const ins = await pg('/app_users', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: user.id, email, password_hash: hashPassword(password) }),
    })
    if (!ins.ok) {
      if (String(ins.text).includes('23505') || String(ins.text).includes('duplicate')) {
        return sendJson(res, 400, { error_description: 'User already registered' })
      }
      return sendJson(res, 500, { error_description: '注册失败，请稍后再试' })
    }
    return sendJson(res, 200, await issueSession(user))
  }

  // 登录 / 刷新
  if (pathname.endsWith('/token')) {
    const grant = new URLSearchParams(search).get('grant_type') || ''
    const body = await jsonBody(req)
    if (!body) return sendJson(res, 400, { error_description: '请求体格式错误' })

    if (grant === 'refresh_token') {
      const token = String(body.refresh_token || '')
      const r = await pg(`/app_sessions?refresh_token=eq.${encodeURIComponent(token)}&select=user_id,expires_at`)
      if (!r.ok) return sendJson(res, 502, { error_description: '数据库暂时不可用' })
      const row = Array.isArray(r.data) ? r.data[0] : null
      if (!row) return sendJson(res, 400, { error_description: 'invalid_grant' })
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await pg(`/app_sessions?refresh_token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' })
        return sendJson(res, 400, { error_description: 'invalid_grant' })
      }
      const u = await pg(`/app_users?id=eq.${encodeURIComponent(row.user_id)}&select=id,email`)
      const user = Array.isArray(u.data) ? u.data[0] : null
      if (!user) return sendJson(res, 400, { error_description: 'user_not_found' })
      // 轮换：旧刷新令牌作废，避免被重复使用
      await pg(`/app_sessions?refresh_token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' })
      return sendJson(res, 200, await issueSession(user))
    }

    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const r = await pg(`/app_users?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash`)
    if (!r.ok) return sendJson(res, 502, { error_description: '数据库暂时不可用' })
    const user = Array.isArray(r.data) ? r.data[0] : null
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJson(res, 400, { error_description: 'Invalid login credentials' })
    }
    return sendJson(res, 200, await issueSession({ id: user.id, email: user.email }))
  }

  // 登出：吊销该账号的刷新令牌（本地会话前端已清除）
  if (pathname.endsWith('/logout')) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const payload = verifyToken(token)
    if (payload?.sub) {
      await pg(`/app_sessions?user_id=eq.${encodeURIComponent(payload.sub)}`, { method: 'DELETE' })
    }
    res.writeHead(204, { 'Cache-Control': 'no-store' })
    return res.end()
  }


  // 管理员生成找回密码短码（线下转给本人；无邮件服务时的可行方案）
  if (pathname.endsWith('/reset-code')) {
    const body = await jsonBody(req)
    if (!body) return sendJson(res, 400, { error_description: '请求体格式错误' })
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const auth = verifyToken(token)
    if (!auth) return sendJson(res, 401, { error_description: 'unauthorized' })
    const scope = String(body.scope || 'huacheng')
    const gate = await canWrite(scope, auth.sub, true)
    if (!gate.ok) return sendJson(res, 403, { error_description: gate.reason })
    const email = String(body.email || '').trim().toLowerCase()
    const u = await pg(`/app_users?email=eq.${encodeURIComponent(email)}&select=id,email`)
    const user = Array.isArray(u.data) ? u.data[0] : null
    if (!user) return sendJson(res, 404, { error_description: '该邮箱尚未注册' })
    const bucket = Math.floor(Date.now() / 600000)
    return sendJson(res, 200, { email, code: resetCode(email, bucket), expires_in: 1200 })
  }

  // 用短码重置密码：校验通过后改 hash，并吊销全部刷新令牌
  if (pathname.endsWith('/reset-password')) {
    const body = await jsonBody(req)
    if (!body) return sendJson(res, 400, { error_description: '请求体格式错误' })
    const email = String(body.email || '').trim().toLowerCase()
    const code = String(body.code || '').trim().toUpperCase()
    const password = String(body.password || '')
    if (password.length < 6) return sendJson(res, 400, { error_description: '密码至少 6 位' })
    const bucket = Math.floor(Date.now() / 600000)
    const valid = [bucket, bucket - 1].some((b) => resetCode(email, b) === code)
    if (!valid) return sendJson(res, 400, { error_description: '重置码无效或已过期' })
    const u = await pg(`/app_users?email=eq.${encodeURIComponent(email)}&select=id`)
    const user = Array.isArray(u.data) ? u.data[0] : null
    if (!user) return sendJson(res, 404, { error_description: '账号不存在' })
    const upd = await pg(`/app_users?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ password_hash: hashPassword(password) }),
    })
    if (!upd.ok) return sendJson(res, 502, { error_description: '数据库暂时不可用' })
    await pg(`/app_sessions?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' })
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 404, { error_description: 'not found' })
}

// ---------- 数据接口（校验后转发 PostgREST） ----------

async function handleRest(req, res, restPath, search, method) {
  const table = restPath.replace(/^\/+/, '').split('/')[0]
  if (!['app_state', 'app_members'].includes(table)) {
    return sendJson(res, 404, { message: `table '${table}' not exposed` })
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const auth = verifyToken(token)
  if (!auth) {
    return sendJson(res, 401, { message: 'JWT expired or invalid', code: '401' })
  }

  const raw = method === 'GET' || method === 'DELETE' ? '' : await readBody(req)
  let body = null
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      return sendJson(res, 400, { message: 'invalid json body' })
    }
  }

  if (method !== 'GET') {
    if (Array.isArray(body)) return sendJson(res, 400, { message: 'batch writes are not supported' })
    const row = body || {}
    const field = table === 'app_state' ? 'id' : 'scope'
    const filters = new URLSearchParams(search).getAll(field)
    if (filters.length > 1 || (filters.length === 1 && !filters[0].startsWith('eq.'))) {
      return sendJson(res, 400, { message: 'invalid scope filter' })
    }
    const filteredScope = filters.length ? filters[0].slice(3) : ''
    if (filteredScope && row[field] != null && String(row[field]) !== filteredScope) {
      return sendJson(res, 400, { message: 'scope cannot be changed' })
    }
    if ((method === 'PATCH' || method === 'DELETE') && !filteredScope) {
      return sendJson(res, 400, { message: 'scope filter required' })
    }
    if (table === 'app_state') {
      const scope = eqValue(search, 'id') || String(row.id || '')
      const gate = await canWrite(scope, auth.sub, false)
      if (!gate.ok) {
        return sendJson(res, 403, { message: `row-level security: ${gate.reason}`, code: '42501' })
      }
    } else {
      const scope = eqValue(search, 'scope') || String(row.scope || '')
      // 新增成员 / 改权限 / 移除成员：要求管理员；名册为空时允许首个账号自举
      const gate = await canWrite(scope, auth.sub, true)
      if (!gate.ok) {
        return sendJson(res, 403, { message: `row-level security: ${gate.reason}`, code: '42501' })
      }
    }
  }

  // 原样转发：查询串、方法、请求体、Prefer（含 return=representation / merge-duplicates）
  const prefer = req.headers.prefer
  const upstream = await pg(`/${table}${search}`, {
    method,
    headers: prefer ? { Prefer: String(prefer) } : {},
    ...(raw ? { body: raw } : {}),
  })

  const outText = typeof upstream.data === 'string' ? upstream.data : JSON.stringify(upstream.data ?? null)
  res.writeHead(upstream.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(outText),
    'Cache-Control': 'no-store',
  })
  res.end(outText)
}

// ---------- 静态资源 ----------

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  // 防目录穿越
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(DIST, safe)
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    // 无扩展名视为前端路由 → 回退 index.html
    if (!path.extname(rel)) {
      file = path.join(DIST, 'index.html')
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }
  }
  const ext = path.extname(file).toLowerCase()
  const isHashed = /\/assets\//.test(file)
  const buf = readFileSync(file)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    // 带指纹的产物可长期缓存；index.html 必须每次回源，保证发版即时生效
    'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(buf)
}

// ---------- 入口 ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname
    const method = (req.method || 'GET').toUpperCase()

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization,content-type,prefer,apikey',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      })
      return res.end()
    }

    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        dist: existsSync(path.join(DIST, 'index.html')),
        env: ENV_ID ? 'configured' : 'missing',
        key: API_KEY ? 'configured' : 'missing',
        secret: JWT_SECRET ? 'configured' : 'missing',
        time: new Date().toISOString(),
      })
    }

    if (pathname.startsWith('/api/auth/v1/')) {
      return handleAuth(req, res, pathname, url.search)
    }

    if (pathname.startsWith('/api/rest/v1/')) {
      return handleRest(req, res, pathname.slice('/api/rest/v1'.length), url.search, method)
    }

    return serveStatic(req, res, pathname)
  } catch (e) {
    console.error('[realm-api] unhandled', e)
    if (!res.headersSent) sendJson(res, 500, { message: 'internal error' })
    else res.end()
  }
})

const PORT = Number(process.env.PORT || 9000)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[realm-api] listening on ${PORT}, dist=${existsSync(DIST)}`)
})
