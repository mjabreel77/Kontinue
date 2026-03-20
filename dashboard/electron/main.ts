import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import http from 'http'

let mainWindow: BrowserWindow | null = null

// The dashboard React app handles its own API connection via the project
// selector or saved config — no need to spawn a backend process.
// The .NET API server (Kontinue.Api) should be running separately.

const DEFAULT_API_URL = 'http://localhost:5152'

function checkApiReachable(url: string = DEFAULT_API_URL, retries = 5, interval = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0
    const check = () => {
      attempts++
      const req = http.get(`${url}/api/workspaces`, (res) => {
        res.destroy()
        resolve(true)
      })
      req.on('error', () => {
        if (attempts >= retries) resolve(false)
        else setTimeout(check, interval)
      })
      req.setTimeout(2000, () => {
        req.destroy()
        if (attempts >= retries) resolve(false)
        else setTimeout(check, interval)
      })
    }
    check()
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
  const apiReachable = await checkApiReachable()
  if (apiReachable) {
    console.log('[electron] .NET API is reachable')
  } else {
    console.warn('[electron] .NET API not reachable at', DEFAULT_API_URL, '— dashboard will show connection prompt')
  }

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
