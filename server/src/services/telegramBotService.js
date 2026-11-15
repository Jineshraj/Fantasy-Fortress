import { matchLineupWithAI } from './universalAiMatcher.js'
import { extractLineupWithAI } from './aiExtractor.js'
import { validateAndMatchRoster } from './rosterValidator.js'
import { upsertLineupToSheet, fetchTeamSquadFromSheet, resolveExactTabName, fetchSubmittedTeamsFromSheet, getActiveGameweek, REAL_16_TABS } from './sheetsService.js'
import { formatTeamWhatsAppPoints, formatAllTeamsWhatsAppPoints, formatGwStandingsWhatsApp, formatSeasonStandingsWhatsApp } from './whatsappFormatterService.js'

// Active Gameweek tracking (dynamic fallback to Google Sheet with manual admin override)
let explicitAdminGw = null

export async function getCurrentActiveGw() {
  if (explicitAdminGw !== null) return explicitAdminGw
  try {
    return await getActiveGameweek()
  } catch (e) {
    return 1
  }
}

/**
 * Returns allowed admin Telegram user IDs from .env
 */
function getAllowedAdminIds() {
  const envAdmins = process.env.ALLOWED_ADMIN_IDS || ''
  return envAdmins
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

/**
 * Checks if a Telegram user is an authorized admin
 */
export function isAuthorizedAdmin(userId) {
  const allowedIds = getAllowedAdminIds()
  if (allowedIds.length === 0) {
    console.warn(`[Security] ALLOWED_ADMIN_IDS is not configured in .env! Denying access to User ID: ${userId}`)
    return false
  }
  return allowedIds.includes(String(userId))
}

/**
 * Returns the interactive admin keyboard buttons with live active GW display
 */
export function getAdminKeyboard(gw = 1) {
  return {
    reply_markup: {
      keyboard: [
        [{ text: `📌 Active: GW${gw}` }, { text: '📊 Missing Teams' }],
        [{ text: '📋 Export WhatsApp Points' }, { text: '❓ Help' }],
      ],
      resize_keyboard: true,
      persistent: true,
    },
  }
}

/**
 * Generates an inline keyboard with all 16 teams + 'Export All' + Standings buttons
 */
export function getExportPointsInlineKeyboard(gw = 1) {
  const inline_keyboard = [
    [{ text: `📤 Export All (16 Teams + Standings)`, callback_data: `exp_all_${gw}` }],
    [
      { text: `📊 GW${gw} Standings`, callback_data: `exp_gwst_${gw}` },
      { text: `🏆 Season Standings`, callback_data: `exp_sst_${gw}` },
    ]
  ]

  // Add 16 teams in 2-column rows
  for (let i = 0; i < REAL_16_TABS.length; i += 2) {
    const row = []
    const t1 = REAL_16_TABS[i]
    row.push({ text: t1, callback_data: `exp_team_${t1}_${gw}` })
    if (i + 1 < REAL_16_TABS.length) {
      const t2 = REAL_16_TABS[i + 1]
      row.push({ text: t2, callback_data: `exp_team_${t2}_${gw}` })
    }
    inline_keyboard.push(row)
  }

  return { reply_markup: { inline_keyboard } }
}

/**
 * Main Telegram Webhook Payload Processor
 */
export async function processTelegramMessage(update) {
  // 1. Handle Callback Query (Inline Keyboard Clicks)
  if (update.callback_query) {
    const cb = update.callback_query
    const chatId = cb.message?.chat?.id
    const userId = cb.from?.id || chatId
    const data = cb.data || ''

    if (!isAuthorizedAdmin(userId)) {
      return { chatId, text: '⛔ *Access Denied*', options: { parse_mode: 'Markdown' } }
    }

    // Handle "Export All Teams + Standings"
    if (data.startsWith('exp_all_')) {
      const gw = parseInt(data.replace('exp_all_', ''), 10) || (await getCurrentActiveGw())
      const allResults = await formatAllTeamsWhatsAppPoints(gw)
      const messages = allResults.filter(r => r.success).map(r => r.message)

      return {
        chatId,
        isBatch: true,
        messages,
        summaryText: `✅ *Exported All 16 Teams & Standings for GW${gw}!*\n(Sent ${messages.length} WhatsApp-ready messages below)`,
      }
    }

    // Handle "GW Standings Only"
    if (data.startsWith('exp_gwst_')) {
      const gw = parseInt(data.replace('exp_gwst_', ''), 10) || (await getCurrentActiveGw())
      try {
        const gwMsg = await formatGwStandingsWhatsApp(gw)
        return { chatId, text: gwMsg, options: { parse_mode: 'Markdown' } }
      } catch (err) {
        return { chatId, text: `⚠️ *Error generating GW${gw} standings:*\n${err.message}`, options: { parse_mode: 'Markdown' } }
      }
    }

    // Handle "Season Standings Only"
    if (data.startsWith('exp_sst_')) {
      const gw = parseInt(data.replace('exp_sst_', ''), 10) || (await getCurrentActiveGw())
      try {
        const sMsg = await formatSeasonStandingsWhatsApp(gw)
        return { chatId, text: sMsg, options: { parse_mode: 'Markdown' } }
      } catch (err) {
        return { chatId, text: `⚠️ *Error generating Season standings:*\n${err.message}`, options: { parse_mode: 'Markdown' } }
      }
    }

    // Handle "Export Single Team"
    if (data.startsWith('exp_team_')) {
      const parts = data.replace('exp_team_', '').split('_')
      const targetGw = parseInt(parts.pop(), 10) || (await getCurrentActiveGw())
      const teamName = parts.join('_')

      try {
        const teamMsg = await formatTeamWhatsAppPoints(teamName, targetGw)
        return {
          chatId,
          text: teamMsg,
          options: { parse_mode: 'Markdown' },
        }
      } catch (err) {
        return {
          chatId,
          text: `⚠️ *Error generating points for ${teamName} (GW${targetGw}):*\n${err.message}`,
          options: { parse_mode: 'Markdown' },
        }
      }
    }

    return null
  }

  const message = update.message
  if (!message || !message.text) return null

  const chatId = message.chat.id
  const userId = message.from?.id || chatId
  const text = message.text.trim()

  const currentGw = await getCurrentActiveGw()

  // 0. Security Whitelist Check
  if (!isAuthorizedAdmin(userId)) {
    console.warn(`[Security] Blocked unauthorized access from User ID: ${userId}`)
    return {
      chatId,
      text: '⛔ *Access Denied*\n\nThis bot is private to authorized Fantasy Football League Admins.',
      options: { parse_mode: 'Markdown' },
    }
  }

  // 1. Handle Command: Set Custom Gameweek (e.g. /setgw 1, /gw 1)
  const setGwMatch = text.match(/^\/(?:setgw|gw)\s+(\d+)$/i)
  if (setGwMatch) {
    const requestedGw = parseInt(setGwMatch[1], 10)
    if (isNaN(requestedGw) || requestedGw < 1 || requestedGw > 38) {
      return {
        chatId,
        text: '⚠️ *Invalid Gameweek:* Gameweek must be between 1 and 38.',
        options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) },
      }
    }
    explicitAdminGw = requestedGw
    const submittedList = await fetchSubmittedTeamsFromSheet(explicitAdminGw)

    const replyText = `🎯 *ACTIVE GAMEWEEK LOCKED TO GW${explicitAdminGw}*\n\n` +
      `📊 Progress: *${submittedList.length} / 16 Teams Submitted*\n\n` +
      `All forwarded lineups will strictly save under *GW${explicitAdminGw}*.`

    return { chatId, text: replyText, options: { parse_mode: 'Markdown', ...getAdminKeyboard(explicitAdminGw) } }
  }

  // 2. Handle Tap on Active GW Button (e.g. 📌 Active: GW1)
  if (text.startsWith('📌 Active: GW')) {
    const submittedList = await fetchSubmittedTeamsFromSheet(currentGw)

    const replyText = `📌 *CURRENT ACTIVE TARGET: GW${currentGw}*\n\n` +
      `📊 Live Sheet Progress: *${submittedList.length} / 16 Teams Submitted*\n\n` +
      `💡 *To switch to a different Gameweek:*\n` +
      `Type \`/setgw <number>\` (example: \`/setgw ${currentGw + 1}\`).`

    return { chatId, text: replyText, options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) } }
  }

  // 3. Handle Command: Check Missing Teams (Dynamically reads Google Sheet Lineup_Rosters tab)
  if (text === '📊 Missing Teams' || text === '/missing') {
    const submittedList = await fetchSubmittedTeamsFromSheet(currentGw)
    const submittedSet = new Set(submittedList)
    const missing = REAL_16_TABS.filter((t) => !submittedSet.has(t))

    let replyText = `📊 *GW${currentGw} SUBMISSION PROGRESS*\n` +
      `✅ *${submittedList.length} / 16 Teams Submitted*\n\n`

    if (missing.length === 0) {
      replyText += `🎉 *All 16 teams have submitted for GW${currentGw}!*`
    } else {
      replyText += `⏳ *STILL MISSING (${missing.length}):*\n` +
        missing.map((t, i) => `${i + 1}. ${t}`).join('\n')
    }

    return { chatId, text: replyText, options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) } }
  }

  // 4. Handle Standings Shortcut Commands (/standings, /season)
  const standingsMatch = text.match(/^\/standings(?:\s+(\d+))?$/i)
  if (standingsMatch) {
    const gw = standingsMatch[1] ? parseInt(standingsMatch[1], 10) : currentGw
    if (isNaN(gw) || gw < 1 || gw > 38) {
      return { chatId, text: '⚠️ *Invalid Gameweek:* Gameweek must be between 1 and 38.', options: { parse_mode: 'Markdown' } }
    }
    try {
      const gwMsg = await formatGwStandingsWhatsApp(gw)
      return { chatId, text: gwMsg, options: { parse_mode: 'Markdown' } }
    } catch (err) {
      return { chatId, text: `⚠️ *Error:* ${err.message}`, options: { parse_mode: 'Markdown' } }
    }
  }

  const seasonMatch = text.match(/^\/season(?:\s+(\d+))?$/i)
  if (seasonMatch) {
    const gw = seasonMatch[1] ? parseInt(seasonMatch[1], 10) : currentGw
    if (isNaN(gw) || gw < 1 || gw > 38) {
      return { chatId, text: '⚠️ *Invalid Gameweek:* Gameweek must be between 1 and 38.', options: { parse_mode: 'Markdown' } }
    }
    try {
      const sMsg = await formatSeasonStandingsWhatsApp(gw)
      return { chatId, text: sMsg, options: { parse_mode: 'Markdown' } }
    } catch (err) {
      return { chatId, text: `⚠️ *Error:* ${err.message}`, options: { parse_mode: 'Markdown' } }
    }
  }

  // 5. Handle Export WhatsApp Points Menu (Button or Command)
  if (text === '📋 Export WhatsApp Points' || text === '/export' || text === '/points' || text.match(/^\/points\s+(\d+)$/i)) {
    const customGwMatch = text.match(/^\/points\s+(\d+)$/i)
    const targetGw = customGwMatch ? parseInt(customGwMatch[1], 10) : currentGw
    if (isNaN(targetGw) || targetGw < 1 || targetGw > 38) {
      return { chatId, text: '⚠️ *Invalid Gameweek:* Gameweek must be between 1 and 38.', options: { parse_mode: 'Markdown' } }
    }

    const replyText = `📋 *EXPORT WHATSAPP POINTS (GW${targetGw})*\n\n` +
      `Select a team or standings below, or tap *Export All* to send everything:`

    return {
      chatId,
      text: replyText,
      options: {
        parse_mode: 'Markdown',
        ...getExportPointsInlineKeyboard(targetGw),
      },
    }
  }

  // 5b. Handle Specific Team Export via Command (e.g. /points Reds 3, /points all 3)
  const teamExportMatch = text.match(/^\/points\s+([a-zA-Z\s\(\)]+?)(?:\s+(\d+))?$/i)
  if (teamExportMatch) {
    const rawTarget = teamExportMatch[1].trim()
    const customGw = teamExportMatch[2] ? parseInt(teamExportMatch[2], 10) : currentGw
    if (isNaN(customGw) || customGw < 1 || customGw > 38) {
      return { chatId, text: '⚠️ *Invalid Gameweek:* Gameweek must be between 1 and 38.', options: { parse_mode: 'Markdown' } }
    }

    if (rawTarget.toLowerCase() === 'all') {
      const allResults = await formatAllTeamsWhatsAppPoints(customGw)
      const messages = allResults.filter(r => r.success).map(r => r.message)

      return {
        chatId,
        isBatch: true,
        messages,
        summaryText: `✅ *Exported All 16 Teams & Standings for GW${customGw}!*\n(Sent ${messages.length} WhatsApp-ready messages below)`,
      }
    }

    const resolved = resolveExactTabName(rawTarget)
    if (resolved) {
      try {
        const teamMsg = await formatTeamWhatsAppPoints(resolved, customGw)
        return {
          chatId,
          text: teamMsg,
          options: { parse_mode: 'Markdown' },
        }
      } catch (err) {
        return {
          chatId,
          text: `⚠️ *Error generating points for ${resolved} (GW${customGw}):*\n${err.message}`,
          options: { parse_mode: 'Markdown' },
        }
      }
    }
  }

  // 6. Handle Command: Help
  if (text === '❓ Help' || text === '/help') {
    const replyText = `📖 *Fantasy Fortress Admin Bot Guide:*\n\n` +
      `• *Forward any WhatsApp lineup message* : Bot parses, auto-fills 11+4, and saves to Google Sheet.\n` +
      `• *📋 Export WhatsApp Points* : Generates WhatsApp-ready copy-paste cards for teams, GW standings & Season standings.\n` +
      `• */points all [gw]* : Export all 16 teams + GW & Season standings.\n` +
      `• */points <team> [gw]* : Export specific team (e.g. \`/points Reds 3\`).\n` +
      `• */standings [gw]* : Export GW Standings.\n` +
      `• */season [gw]* : Export Season Standings.\n` +
      `• */setgw <number>* : Lock target gameweek manually (e.g. \`/setgw 3\`).\n` +
      `• *📊 Missing Teams* : Shows live missing teams for GW${currentGw} directly from Google Sheet.`

    return { chatId, text: replyText, options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) } }
  }

  // 7. Handle Message: Process Lineup Text using 2-Stage Universal AI Matcher
  try {
    console.log(`[Telegram Bot] Processing lineup text for GW${currentGw}...`)

    // Step A: Fast Team Name Extraction
    const initialParsed = await extractLineupWithAI(text)
    const teamName = resolveExactTabName(initialParsed.team_name)
    console.log(`[Telegram Bot] Resolved Team Tab: "${teamName}"`)

    // Step B: Dynamically load official squad for this team from Google Sheets
    const officialSquad = await fetchTeamSquadFromSheet(teamName)

    // Step C: Universal AI Matching - Passes raw text AND official squad to AI to match all nicknames/initials
    let finalParsed = initialParsed
    if (officialSquad && officialSquad.length > 0) {
      try {
        finalParsed = await matchLineupWithAI(text, officialSquad)
      } catch (e) {
        console.warn('[Telegram Bot] Universal matcher error, using initial parsed:', e.message)
      }
    }

    finalParsed.gameweek = currentGw
    finalParsed.team_name = teamName

    // Step D: Validate formation and auto-fill any missing spots
    const validatedLineup = validateAndMatchRoster(finalParsed, officialSquad)

    // Safety guard: reject saving if lineup has fewer than 11 starters
    if (!validatedLineup || !validatedLineup.starters || validatedLineup.starters.length < 11) {
      const identifiedCount = validatedLineup?.starters?.length || 0
      const warningDetails = validatedLineup?.warnings?.length
        ? `\n\n*Diagnostics:*\n` + validatedLineup.warnings.map((w) => `• ${w}`).join('\n')
        : ''
      return {
        chatId,
        text: `⚠️ *LINEUP REJECTED:* Only ${identifiedCount} / 11 starters identified for *${teamName}*.\n\n` +
          `Refusing to save an incomplete lineup to the database. Please verify player names/formatting and submit again.${warningDetails}`,
        options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) },
      }
    }

    // Step E: True UPSERT to Lineup_Rosters tab (Replaces existing team rows, 0 duplicates)
    await upsertLineupToSheet(validatedLineup)

    // Step E: Fetch live submitted teams list directly from Google Sheets
    const submittedList = await fetchSubmittedTeamsFromSheet(currentGw)
    const isUpdate = submittedList.filter((t) => t.toLowerCase() === teamName.toLowerCase()).length > 0
    const missingCount = 16 - submittedList.length

    const startingGk = (validatedLineup.starters || []).find(
      (p) => (p.pos || '').toUpperCase() === 'GK' || (p.pos || '').toUpperCase() === 'GKP'
    )

    let replyText = (isUpdate ? `✅ *SAVED & VALIDATED:* ` : `✅ *SAVED & VALIDATED:* `) +
      `*${teamName}* (GW${currentGw})\n` +
      `🧤 Goalkeeper: *${startingGk ? startingGk.name : '⚠️ None'}*\n` +
      `📐 Formation: *${validatedLineup.formation}* ${validatedLineup.isFormationValid ? '✅' : '⚠️'}\n` +
      `👑 Captain: *${validatedLineup.captain}*\n` +
      `⚔️ Vice: *${validatedLineup.vice_captain}*\n\n`

    if (finalParsed.parserSource === 'DETERMINISTIC_FALLBACK') {
      replyText += `⚠️ *NOTICE: Parsed via Backup Fallback Parser (Groq AI was unreachable). Please verify Captain, VC & Bench carefully!*\n\n`
    } else {
      replyText += `🧠 *Engine: ${finalParsed.modelUsed || 'Groq AI'}*\n\n`
    }

    replyText += `📊 Progress: *${submittedList.length} / 16 Teams Submitted*\n` +
      `⏳ Still Missing: *${missingCount} teams*`

    if (validatedLineup.autoFillNotices && validatedLineup.autoFillNotices.length > 0) {
      replyText += `\n\nℹ️ *Auto-Fill Applied:*\n` + validatedLineup.autoFillNotices.map((n) => `• ${n}`).join('\n')
    }

    if (validatedLineup.warnings && validatedLineup.warnings.length > 0) {
      replyText += `\n\n⚠️ *Warnings:*\n` + validatedLineup.warnings.join('\n')
    }

    return { chatId, text: replyText, options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) } }
  } catch (error) {
    console.error('[Telegram Bot Error]', error)
    const replyText = `⚠️ *Lineup Parsing Error*\n\n${error.message}\n\n_Please check your raw text and try forwarding again._`
    return { chatId, text: replyText, options: { parse_mode: 'Markdown', ...getAdminKeyboard(currentGw) } }
  }
}
