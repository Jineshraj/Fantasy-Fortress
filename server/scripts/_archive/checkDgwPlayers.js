import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

const sheets = google.sheets({ version: 'v4', auth: getGoogleAuth() })
const ssId = process.env.GOOGLE_SHEET_ID

async function main() {
  const [rosterRes, playersRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Lineup_Rosters!A2:H' }),
    sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Players!A2:E' }),
  ])

  const clubMap = new Map()
  for (const r of playersRes.data.values || []) {
    const name = String(r[1] || '').trim()
    const club = String(r[4] || '').trim()
    clubMap.set(name.toLowerCase(), club)
  }

  const gw8Rosters = (rosterRes.data.values || []).filter(r => r[0] === '8')
  const dgwPlayers = []
  for (const r of gw8Rosters) {
    const team = r[1]
    const player = r[2]
    const club = clubMap.get(player.toLowerCase()) || ''
    if (club.toLowerCase().includes('athletic') || club.toLowerCase().includes('bilbao') || club.toLowerCase().includes('levante')) {
      dgwPlayers.push({ team, player, club, role: r[4] })
    }
  }

  console.log('DGW Players in GW8 Rosters:', dgwPlayers)
}

main().catch(console.error)
