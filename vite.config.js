import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0'

const AIRTABLE_TOKEN = '***REMOVED_AIRTABLE_PAT***'

function googleSheetsProxy() {
  return {
    name: 'google-sheets-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sheets', async (_req, res) => {
        try {
          const response = await fetch(SHEETS_CSV_URL, { redirect: 'follow' })
          if (!response.ok) {
            res.writeHead(response.status)
            res.end(`Google Sheets returned ${response.status}`)
            return
          }
          const csv = await response.text()
          res.setHeader('Content-Type', 'text/csv; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.writeHead(200)
          res.end(csv)
        } catch (err) {
          res.writeHead(500)
          res.end(`Proxy error: ${err.message}`)
        }
      })
    },
  }
}

function airtableProxy() {
  return {
    name: 'airtable-proxy',
    configureServer(server) {
      server.middlewares.use('/api/airtable', async (req, res) => {
        try {
          // Strip the /api/airtable prefix to get the Airtable path
          const airtablePath = req.url || ''
          const airtableUrl = `https://api.airtable.com/v0${airtablePath}`

          // Read request body for POST/PATCH/DELETE
          let body = null
          if (req.method !== 'GET') {
            body = await new Promise((resolve) => {
              let data = ''
              req.on('data', (chunk) => { data += chunk })
              req.on('end', () => resolve(data || null))
            })
          }

          const fetchOptions = {
            method: req.method,
            headers: {
              Authorization: `Bearer ${AIRTABLE_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
          if (body) fetchOptions.body = body

          const response = await fetch(airtableUrl, fetchOptions)

          const data = await response.text()
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.writeHead(response.status)
          res.end(data)
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: `Airtable proxy error: ${err.message}` }))
        }
      })
    },
  }
}

const SUPERCHAT_API_KEY = '16c33577-443e-4290-ac25-2493a5d6fd0e'

function superchatProxy() {
  return {
    name: 'superchat-proxy',
    configureServer(server) {
      server.middlewares.use('/api/superchat', async (req, res) => {
        try {
          const superchatPath = req.url || ''
          const superchatUrl = `https://api.superchat.com/v1.0${superchatPath}`

          // Read request body for POST/PATCH/DELETE
          let body = null
          if (req.method !== 'GET') {
            body = await new Promise((resolve) => {
              let data = ''
              req.on('data', (chunk) => { data += chunk })
              req.on('end', () => resolve(data || null))
            })
          }

          const fetchOptions = {
            method: req.method,
            headers: {
              'X-API-KEY': SUPERCHAT_API_KEY,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          }
          if (body) fetchOptions.body = body

          const response = await fetch(superchatUrl, fetchOptions)
          const data = await response.text()

          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.writeHead(response.status)
          res.end(data)
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: `Superchat proxy error: ${err.message}` }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), googleSheetsProxy(), airtableProxy(), superchatProxy()],
})
