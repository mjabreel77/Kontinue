import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import { loadConfig } from '../../utils/config.js'
import { storeToken } from '../../utils/credentials.js'
import { ok, err } from '../../utils/display.js'
import chalk from 'chalk'

export default class AuthLogin extends Command {
  static description = 'Authenticate with the Kontinue server via browser login'

  static flags = {
    'api-url': Flags.string({ description: 'API server URL (overrides config)' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin)
    const cwd = resolve(process.cwd())
    const config = await loadConfig(cwd)

    const apiUrl = (flags['api-url'] ?? config.backendUrl ?? '').replace(/\/$/, '')
    if (!apiUrl) {
      err('No API URL configured. Run: kontinue init --backend=remote')
      return
    }

    console.log(chalk.dim('\n  Starting browser login...\n'))

    try {
      const result = await browserAuthFlow(apiUrl)
      await storeToken(apiUrl, result.token)

      ok('Logged in successfully')
      console.log(chalk.dim('  Email:   ') + chalk.white(result.email))
      console.log(chalk.dim('  User:    ') + chalk.white(result.displayName ?? result.email))
      console.log(chalk.dim('  Expires: ') + chalk.white(new Date(result.expiresAt).toLocaleDateString()))
      console.log(chalk.dim('  Token stored in OS keychain'))
      console.log()
    } catch (error) {
      err(`Login failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export interface AuthResult {
  token: string
  userId: string
  email: string
  displayName: string | null
  expiresAt: string
}

export async function browserAuthFlow(apiUrl: string): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    // Track open connections so we can destroy them on close
    const connections = new Set<import('node:net').Socket>()

    // Start a temporary local HTTP server to receive the callback
    const server = createServer((req, res) => {
      // CORS for the browser login page
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'POST' && req.url === '/callback') {
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as AuthResult
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
            clearTimeout(timeout)
            // Destroy all open sockets so the process can exit
            for (const socket of connections) {
              socket.destroy()
            }
            server.close()
            resolve(data)
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid response' }))
          }
        })
        return
      }

      res.writeHead(404)
      res.end()
    })

    // Track connections for forced cleanup
    server.on('connection', (socket) => {
      connections.add(socket)
      socket.on('close', () => connections.delete(socket))
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to start local callback server'))
        return
      }

      const port = addr.port
      const loginUrl = `${apiUrl}/auth/cli?port=${port}`

      console.log(chalk.dim('  Open this URL in your browser:'))
      console.log(chalk.bold.cyan(`  ${loginUrl}`))
      console.log()

      // Try to open browser automatically
      import('node:child_process').then(({ exec }) => {
        const cmd = process.platform === 'win32' ? `start "${loginUrl}"` :
          process.platform === 'darwin' ? `open "${loginUrl}"` :
            `xdg-open "${loginUrl}"`
        exec(cmd, () => { /* ignore errors — user can open manually */ })
      })
    })

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      for (const socket of connections) {
        socket.destroy()
      }
      server.close()
      reject(new Error('Login timed out after 5 minutes'))
    }, 5 * 60 * 1000)
  })
}
