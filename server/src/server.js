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
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
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

  // 3. Automated External Cron Trigger Endpoint (For Cron-Job.org / Render Cron) (Fixes HIGH-10)
  if ((url.pathname === '/api/sync' || url.pathname === '/cron/sync') && (req.method === 'POST' || req.method === 'GET')) {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers['authorization'] || ''
    const secretParam = url.searchParams.get('secret') || ''

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid CRON_SECRET' }))
      return
    }

    const gwParam = url.searchParams.get('gw')
    try {
      const targetGw = gwParam ? Number(gwParam) : await getActiveGameweek()
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
