import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import http from 'http'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

const API_PORT = 3456
const API_URL = `http://localhost:${API_PORT}`

function findKontinueBin(): string {
  // In packaged app, kontinue CLI should be globally installed
  // Use npx-style resolution or direct binary name
  if (process.platform === 'win32') {
    return 'kontinue.cmd'
  }
  return 'kontinue'
}

function startBackend(): void {
  const bin = findKontinueBin()
  backendProcess = spawn(bin, ['web', '--no-open', '--port', String(API_PORT)], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
  })

  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[kontinue web] ${data.toString().trim()}`)
  })

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[kontinue web] ${data.toString().trim()}`)
  })

  backendProcess.on('error', (err: Error) => {
    console.error('[kontinue web] Failed to start:', err.message)
    backendProcess = null
  })

  backendProcess.on('exit', (code: number | null) => {
    console.log(`[kontinue web] exited with code ${code}`)
    backendProcess = null
  })
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    if (process.platform === 'win32') {
      // On Windows, shell:true spawns via cmd, so we need to kill the tree
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], { shell: true })
    } else {
      backendProcess.kill('SIGTERM')
    }
    backendProcess = null
  }
}

function waitForBackend(retries = 30, interval = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0
    const check = () => {
      attempts++
      const req = http.get(`${API_URL}/api/events`, (res) => {
        // SSE endpoint responded — backend is up
        res.destroy()
        resolve(true)
      })
      req.on('error', () => {
        if (attempts >= retries) {
          resolve(false)
        } else {
          setTimeout(check, interval)
        }
      })
      req.setTimeout(1000, () => {
        req.destroy()
        if (attempts >= retries) {
          resolve(false)
        } else {
          setTimeout(check, interval)
        }
      })
    }
    check()
  })
}

function isBackendRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${API_URL}/api/events`, (res) => {
      res.destroy()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Kontinue Dashboard',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In production, load built files; in dev, load dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Check if backend is already running (user may have started `kontinue web` manually)
  const alreadyRunning = await isBackendRunning()

  if (!alreadyRunning) {
    console.log('[electron] Starting kontinue web backend...')
    startBackend()
    const ready = await waitForBackend()
    if (ready) {
      console.log('[electron] Backend is ready')
    } else {
      console.warn('[electron] Backend did not start in time — app will show connection error')
    }
  } else {
    console.log('[electron] Backend already running')
  }

  createWindow()
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopBackend()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
