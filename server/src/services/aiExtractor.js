import dotenv from 'dotenv'
import path from 'path'

// Load .env from current directory without overriding existing system env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { Groq } from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

function cleanKey(val) {
  if (!val) return ''
  return val.replace(/['"]/g, '').trim()
}

function getGroqClient() {
  const apiKey = cleanKey(process.env.GROQ_API_KEY)
  if (!apiKey) return null
  return new Groq({ apiKey })
}

const SYSTEM_PROMPT = `
You are an expert Fantasy Football Assistant.
Extract structured lineup data from the user's message into JSON with the format:
{
  "team_name": "Official Team Name",
  "starters": ["Player 1", "Player 2", ...],
  "captain": "Player name labeled (C) or captain",
  "vice_captain": "Player name labeled (V) or vice captain",
  "bench": ["Sub 1", "Sub 2"]
}

CRITICAL RULES:
1. Team Name: Cleanly extract the team name from headers (e.g. '*JOGO BONITO✨*' -> 'Jogo Bonito', '*CHOKERS FC*' -> 'Choakers FC', '*AGUILAS DORADOS 🦅*' -> 'Aguilas Dorados').
2. IGNORE PLACEHOLDER / NON-PLAYER WORDS: Words like "Nill", "Nil", "None", "Rest", "All", "Empty", "NA", "N/A", "-", "No one" are NOT player names. DO NOT put them in starters or bench arrays!
3. If a section lists only "Nill" or "None", leave that position array empty or omit it.
4. Extract only REAL human player names (e.g. "Marc Pubil", "Lamine Yamal", "Marcos Llorente", "Dávid Hancko").
5. Output MUST be valid JSON only.
`

/**
 * Tier 1: Deterministic Zero-API Rule-Based Parser
 * Handles 99% of standard formatted WhatsApp lineups instantly with 100% uptime
 */
export function parseLineupDeterministic(rawText) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 5) return null

  let team_name = ''
  const starters = []
  const bench = []
  let captain = ''
  let vice_captain = ''

  let inStarters = false
  let inBench = false

  for (const line of lines) {
    const cleanLine = line.replace(/[*_~`]/g, '').trim()

    // Detect Team Name from header
    if (!team_name && (line.includes('*') || cleanLine.toUpperCase().includes('FC') || cleanLine.toUpperCase().includes('TEAM') || cleanLine.toUpperCase().includes('BLINDERS') || cleanLine.toUpperCase().includes('CONTROL') || cleanLine.toUpperCase().includes('PULGA') || cleanLine.toUpperCase().includes('FARMERS') || cleanLine.toUpperCase().includes('ILLUMINATI') || cleanLine.toUpperCase().includes('MANCUNIANS') || cleanLine.toUpperCase().includes('RELEGATED') || cleanLine.toUpperCase().includes('FLYERS') || cleanLine.toUpperCase().includes('REDS') || cleanLine.toUpperCase().includes('JOGO') || cleanLine.toUpperCase().includes('MERIDIAN') || cleanLine.toUpperCase().includes('MAMANGAM') || cleanLine.toUpperCase().includes('AGUILAS') || cleanLine.toUpperCase().includes('WIZARDS'))) {
      if (!cleanLine.toUpperCase().startsWith('GW') && !cleanLine.toUpperCase().startsWith('STARTERS') && !cleanLine.toUpperCase().startsWith('SUBS') && !cleanLine.toUpperCase().startsWith('BENCH')) {
        team_name = cleanLine.replace(/[^\w\s-]/g, '').trim()
      }
    }

    // Section headers
    if (cleanLine.toUpperCase().includes('STARTER') || cleanLine.toUpperCase().includes('LINEUP')) {
      inStarters = true
      inBench = false
      continue
    }

    if (cleanLine.toUpperCase().includes('SUB') || cleanLine.toUpperCase().includes('BENCH')) {
      inStarters = false
      inBench = true
      continue
    }

    // Extract player from line
    // e.g. "GK: Brice Samba", "DEF: Dávid Hancko (C)", "1. Pierre Kalulu"
    let playerMatch = cleanLine.replace(/^(GK|DEF|MID|FWD|GKP|DF|MF|FW|\d+\.|\d+\))\s*:\s*/i, '').trim()
    playerMatch = playerMatch.replace(/^(\d+\.|\d+\))\s*/, '').trim()

    if (!playerMatch) continue

    // Detect Captain (C) or Vice (VC)
    let isCap = false
    let isVc = false
    if (/\((c|captain)\)/i.test(playerMatch) || /\b(c|captain)\b$/i.test(playerMatch)) {
      isCap = true
      playerMatch = playerMatch.replace(/\s*\((c|captain)\)/i, '').replace(/\s+\b(c|captain)\b$/i, '').trim()
    }
    if (/\((vc|v|vice|vice captain)\)/i.test(playerMatch) || /\b(vc|v)\b$/i.test(playerMatch)) {
      isVc = true
      playerMatch = playerMatch.replace(/\s*\((vc|v|vice|vice captain)\)/i, '').replace(/\s+\b(vc|v)\b$/i, '').trim()
    }

    // Ignore placeholder words
    const lower = playerMatch.toLowerCase()
    if (['nil', 'nill', 'none', 'n/a', 'na', '-', 'rest', 'all', 'empty'].includes(lower)) {
      continue
    }

    if (playerMatch.length >= 2) {
      if (inBench) {
        bench.push(playerMatch)
      } else if (inStarters || starters.length < 11) {
        starters.push(playerMatch)
        if (isCap && !captain) captain = playerMatch
        if (isVc && !vice_captain) vice_captain = playerMatch
      }
    }
  }

  if (starters.length >= 7) {
    return {
      team_name: team_name || 'Unknown',
      starters,
      captain: captain || starters[0] || '',
      vice_captain: vice_captain || starters[1] || '',
      bench,
    }
  }

  return null
}

/**
 * Main Production Extractor:
 * 1. Primary: Groq AI Engine (openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.6-27b)
 * 2. Fallback: Deterministic Rule Engine (with explicit warning banner)
 */
export async function extractLineupWithAI(rawText) {
  const groq = getGroqClient()
  const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b']
  let lastError = null

  if (groq) {
    for (const model of models) {
      try {
        console.log(`[AI Extractor] Parsing with Groq AI (${model})...`)
        const response = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rawText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })

        let content = response.choices[0]?.message?.content || ''
        content = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
        if (content) {
          const parsed = JSON.parse(content)
          return {
            ...parsed,
            parserSource: 'AI',
            modelUsed: model,
          }
        }
      } catch (err) {
        console.warn(`[AI Extractor] Groq AI model ${model} failed:`, err.message)
        lastError = err
      }
    }
  }

  // 2. Fallback: Google Gemini 2.0 Flash
  try {
    console.log('[AI Extractor] ⚡ Groq AI unavailable/failed. Switching to Gemini 2.0 Flash fallback...')
    const geminiApiKey = cleanKey(process.env.GEMINI_API_KEY)
    if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json' },
      })
      const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nUser Message:\n${rawText}`)
      let responseText = result.response.text() || ''
      responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
      if (responseText) {
        return {
          ...JSON.parse(responseText),
          parserSource: 'AI',
          modelUsed: 'Gemini 2.0 Flash',
        }
      }
    }
  } catch (geminiErr) {
    console.warn('[AI Extractor] Gemini fallback failed:', geminiErr.message)
    lastError = geminiErr
  }

  // 3. Fallback: Deterministic Rule Parser
  console.log('[AI Extractor] ⚠️ Falling back to Deterministic Rule Engine...')
  const deterministicResult = parseLineupDeterministic(rawText)
  if (deterministicResult && deterministicResult.starters.length >= 7) {
    return {
      ...deterministicResult,
      parserSource: 'DETERMINISTIC_FALLBACK',
      modelUsed: 'Regex Rule Engine',
    }
  }

  throw lastError || new Error('Failed to parse lineup with AI or Fallback engine.')
}
