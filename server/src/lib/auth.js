import 'dotenv/config'
import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

let cachedAuth = null

/**
 * Returns an authenticated GoogleAuth client.
 * Priority:
 * 1. ./credentials/*.json on disk (local development)
 * 2. GOOGLE_SERVICE_ACCOUNT_EMAIL & GOOGLE_PRIVATE_KEY in process.env (cloud hosting: Render/Vercel)
 * 3. GOOGLE_SERVICE_ACCOUNT_KEY (full JSON string in process.env)
 */
export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth

  // 1. Check local credentials directory
  const credentialsDir = path.resolve(process.cwd(), './credentials')
  if (fs.existsSync(credentialsDir)) {
    try {
      const files = fs.readdirSync(credentialsDir)
      const jsonFile = files.find((f) => f.endsWith('.json'))
      if (jsonFile) {
        cachedAuth = new google.auth.GoogleAuth({
          keyFile: path.join(credentialsDir, jsonFile),
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
        return cachedAuth
      }
    } catch (e) {
      console.warn('Warning checking credentials directory:', e.message)
    }
  }

  // 2. Check full JSON string in env var
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
      cachedAuth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
      return cachedAuth
    } catch (e) {
      console.warn('Warning parsing GOOGLE_SERVICE_ACCOUNT_KEY env var:', e.message)
    }
  }

  // 3. Check individual email & private key env vars
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    cachedAuth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    return cachedAuth
  }

  throw new Error(
    'Google Service Account credentials not found. Please provide ./credentials/*.json or set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY environment variables.'
  )
}
