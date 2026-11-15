import dotenv from 'dotenv'
import path from 'path'

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

function getGeminiModel() {
  const apiKey = cleanKey(process.env.GEMINI_API_KEY)
  if (!apiKey) return null
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })
}

/**
 * Universal Dual-AI Squad Matcher:
 * 1. Primary: Groq AI (Sub-second response)
 * 2. Fallback: Google Gemini 2.0 Flash
 */
export async function matchLineupWithAI(rawText, officialSquad = []) {
  const squadListFormatted = officialSquad.map((p) => `- ${p.name} (${p.pos})`).join('\n')

  const prompt = `
You are an expert Fantasy Football Lineup Parser.

OFFICIAL SQUAD OF THIS TEAM:
${squadListFormatted || 'No squad list provided'}

USER'S MESSAGE:
${rawText}

INSTRUCTIONS:
1. Cleanly identify the team name.
2. For every starter and bench player in the user's message, find their EXACT match from the OFFICIAL SQUAD list above.
3. Automatically resolve nicknames, abbreviations, and informal names (e.g. "Cucu" -> "Marc Cucurella", "CDK" -> "Charles De Ketelaere", "Kvara" -> "Khvicha Kvaratskhelia", "Le Paul" -> "Estéban Lepaul", "Cubarsi VC" -> "Pau Cubarsí").
4. Identify who is labeled Captain (C) and Vice-Captain (VC / V).
5. Output ONLY the player's full name from the OFFICIAL SQUAD list (do NOT append '(GK)', '(DEF)', '(MID)', '(FOR)' or any position tag to the name).
6. A player can NEVER appear in both 'starters' and 'bench'. Ensure each player appears at most once across the entire lineup.
7. Starters MUST contain exactly 1 Goalkeeper (GK). Ensure the player designated as GK in the user's message is matched to their official Goalkeeper counterpart in the squad.
8. Output ONLY valid JSON in the format:
{
  "team_name": "Official Team Name",
  "starters": ["Exact Official Full Name 1", "Exact Official Full Name 2", ...],
  "captain": "Exact Official Full Name",
  "vice_captain": "Exact Official Full Name",
  "bench": ["Exact Official Full Name 1", "Exact Official Full Name 2", ...]
}
`

  // 1. Try Groq AI (Primary)
  const groq = getGroqClient()
  if (groq) {
    const groqModels = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b']
    for (const model of groqModels) {
      try {
        console.log(`[AI Matcher] Parsing with Groq (${model})...`)
        const response = await groq.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.0,
        })

        let content = response.choices[0]?.message?.content || ''
        content = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
        if (content) {
          return {
            ...JSON.parse(content),
            parserSource: 'AI',
            modelUsed: `Groq (${model})`,
          }
        }
      } catch (err) {
        console.warn(`[AI Matcher] Groq model ${model} failed:`, err.message)
      }
    }
  }

  // 2. Try Google Gemini (Fallback)
  try {
    console.log('[AI Matcher] ⚡ Groq unavailable. Switching to Gemini 2.5 Flash fallback...')
    const gemini = getGeminiModel()
    if (gemini) {
      const result = await gemini.generateContent(prompt)
      let responseText = result.response.text() || ''
      responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
      if (responseText) {
        return {
          ...JSON.parse(responseText),
          parserSource: 'AI',
          modelUsed: 'Gemini 2.5 Flash',
        }
      }
    }
  } catch (geminiErr) {
    console.warn('[AI Matcher] Gemini fallback failed:', geminiErr.message)
  }

  // Both AI providers failed. Throw an error so callers (e.g. telegramBotService)
  // fall back safely to deterministic parsing rather than auto-filling a fabricated lineup.
  console.warn('[AI Matcher] Both AI providers failed in matchLineupWithAI.')
  throw new Error('Both AI providers (Groq and Gemini) failed in matchLineupWithAI')
}
