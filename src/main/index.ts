import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { adoRequest, type AdoRequest } from './ado'

// Menu sem "Fechar janela" (Ctrl+W) e sem "Recarregar" em Ctrl+R/F5: esses atalhos são do renderer
// (fechar aba e recarregar os dados sem perder abas). Recarregar a janela inteira fica em Ctrl+Shift+R.
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    { role: 'editMenu' },
    {
      label: 'Exibir',
      submenu: [
        { role: 'forceReload', label: 'Recarregar janela', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom padrão' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' }
      ]
    }
  ])
)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'DevOps Desktop',
    // Abas na barra de título: o Windows desenha minimizar/maximizar/fechar sobre a faixa de 36px.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a2f36', symbolColor: '#e8f1f0', height: 36 },
    // Em dev o ícone vem do build/icon.ico; no app empacotado o electron-builder
    // grava o mesmo ícone no .exe e a janela herda dele.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build/icon.ico'),
    backgroundColor: '#1b1b1f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('ado:request', (_e, req: AdoRequest) => adoRequest(req))
ipcMain.handle('ado:hasPat', () => Boolean(process.env.AZURE_DEVOPS_EXT_PAT))
ipcMain.handle('ado:defaultOrg', () => process.env.AZURE_DEVOPS_ORG ?? null)
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
