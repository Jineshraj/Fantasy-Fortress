import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

import { processTelegramMessage, getAdminKeyboard, getCurrentActiveGw } from '../src/services/telegramBotService.js'

const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').replace(/['"]/g, '').trim()

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing from .env!')
  process.exit(1)
}

const TELEGRAM_API = `https://api.telegram.org/bot${botToken}`

async function sendMessage(chatId, text, options = {}) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options,
      }),
    })
    return await res.json()
  } catch (err) {
    console.error('Error sending message to Telegram:', err.message)
  }
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    })
  } catch (err) {
    console.error('Error answering callback query:', err.message)
  }
}

async function startPolling() {
  console.log('===========================================================')
  console.log('🤖 TELEGRAM BOT IS LIVE & LISTENING FOR MESSAGES!')
  console.log('Forward any WhatsApp/Telegram lineup message to parse & save.')
  console.log('Use "📋 Export WhatsApp Points" to get copy-paste ready messages.')
  console.log('===========================================================')

  let offset = 0

  while (true) {
    try {
      const response = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`)
      const data = await response.json()

      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1

          // 1. Handle Callback Queries (Inline Button Taps)
          if (update.callback_query) {
            const cb = update.callback_query
            await answerCallbackQuery(cb.id)

            const reply = await processTelegramMessage(update)
            if (reply) {
              if (reply.isBatch && reply.messages) {
                if (reply.summaryText) {
                  await sendMessage(reply.chatId, reply.summaryText, { parse_mode: 'Markdown' })
                }
                for (const msg of reply.messages) {
                  await sendMessage(reply.chatId, msg, { parse_mode: 'Markdown' })
                  await new Promise(r => setTimeout(r, 300)) // Throttle to prevent Telegram rate limit
                }
              } else if (reply.text) {
                await sendMessage(reply.chatId, reply.text, reply.options)
              }
            }
            continue
          }

          // 2. Handle Text Messages
          const message = update.message
          if (!message || !message.text) continue

          const chatId = message.chat.id
          const userText = message.text

          console.log(`\n[Telegram] Received message from ${message.from?.first_name || 'Admin'}: "${userText.slice(0, 30)}..."`)

          // Handle /start command
          if (userText === '/start') {
            const currentGw = await getCurrentActiveGw()
            await sendMessage(
              chatId,
              `👋 *Welcome Admin to SLS Fantasy Lineup Bot!*\n\n` +
              `• Forward any WhatsApp lineup message to parse & save to Google Sheets.\n` +
              `• Tap *📋 Export WhatsApp Points* to get weekly WhatsApp points cards.`,
              { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) }
            )
            continue
          }

          // Process lineup text, export commands, or buttons through our engine
          const reply = await processTelegramMessage(update)
          if (reply) {
            if (reply.isBatch && reply.messages) {
              if (reply.summaryText) {
                await sendMessage(reply.chatId, reply.summaryText, { parse_mode: 'Markdown' })
              }
              for (const msg of reply.messages) {
                await sendMessage(reply.chatId, msg, { parse_mode: 'Markdown' })
                await new Promise(r => setTimeout(r, 300)) // Throttle
              }
            } else if (reply.text) {
              await sendMessage(reply.chatId, reply.text, reply.options)
              console.log(`[Telegram] Sent reply to chat ${chatId}`)
            }
          }
        }
      }
    } catch (err) {
      console.error('Polling error:', err.message)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

startPolling()
