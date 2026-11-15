import 'dotenv/config'
import http from 'http'
import { processTelegramMessage } from './services/telegramBotService.js'
import { executeDailySyncPipeline } from '../scripts/runNightlySyncCron.js'
import { getActiveGameweek } from './services/sheetsService.js'

const PORT = process.env.PORT || 3000

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  // 1. Health Check Endpoint (For Render / Uptime Monitors)
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'healthy',
        service: 'Fantasy Fortress Backend Engine',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      })
    )
    return
  }

  // 2. Telegram Webhook Endpoint
  if (url.pathname === '/webhook/telegram' && req.method === 'POST') {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[Security] TELEGRAM_WEBHOOK_SECRET is not configured! Denying webhook request.')
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: TELEGRAM_WEBHOOK_SECRET is required' }))
      return
    }

    const headerSecret = req.headers['x-telegram-bot-api-secret-token']
    if (headerSecret !== webhookSecret) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Telegram webhook secret' }))
      return
    }

    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unsupported Media Type: Expected application/json' }))
      return
    }

    let body = ''
    let bodyTooLarge = false
    const MAX_BODY_SIZE = 1e6 // 1MB max payload

    req.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY_SIZE) {
        bodyTooLarge = true
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Payload too large' }))
        req.destroy()
      }
    })
    req.on('end', async () => {
      if (bodyTooLarge) return
      try {
        const update = JSON.parse(body)
        const result = await processTelegramMessage(update)

        if (result && result.chatId && result.text) {
          const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`
          await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: result.chatId,
              text: result.text,
              ...(result.options || {}),
            }),
          })
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        console.error('[Webhook Error]', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 3. Automated External Cron Trigger Endpoint (For Cron-Job.org / Render Cron) (Fixes HIGH-10 & P0-2)
  if ((url.pathname === '/api/sync' || url.pathname === '/cron/sync') && (req.method === 'POST' || req.method === 'GET')) {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers['authorization'] || ''
    const secretParam = url.searchParams.get('secret') || ''

    if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: Valid CRON_SECRET is required' }))
      return
    }

    const gwParam = url.searchParams.get('gw')
    try {
      const targetGw = gwParam ? Number(gwParam) : await getActiveGameweek()
      if (isNaN(targetGw) || targetGw < 1 || targetGw > 38) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid gameweek parameter. Must be between 1 and 38.' }))
        return
      }
      console.log(`[HTTP Trigger] Initiating pipeline sync for GW${targetGw}...`)
      
      // Execute pipeline asynchronously
      executeDailySyncPipeline(targetGw).catch((err) => console.error('[Sync Error]', err))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message: `Pipeline sync initiated for GW${targetGw}`,
          timestamp: new Date().toISOString(),
        })
      )
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // 404 Fallback
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
})

server.listen(PORT, () => {
  console.log(`\n===========================================================`)
  console.log(`🚀 FANTASY FORTRESS PRODUCTION SERVER RUNNING ON PORT ${PORT}`)
  console.log(`- Health Check:  http://localhost:${PORT}/health`)
  console.log(`- Telegram Hook: http://localhost:${PORT}/webhook/telegram`)
  console.log(`- Cron Trigger:  http://localhost:${PORT}/api/sync`)
  console.log(`===========================================================\n`)
})
