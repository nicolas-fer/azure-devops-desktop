import { contextBridge, ipcRenderer } from 'electron'

// Eventos do PTY chegam por id. Dados que chegarem antes do renderer assinar o id ficam em buffer.
const dataHandlers = new Map<number, (data: string) => void>()
const exitHandlers = new Map<number, (exitCode: number) => void>()
const pendingData = new Map<number, string[]>()
const pendingExit = new Map<number, number>()

ipcRenderer.on('pty:data', (_e, id: number, data: string) => {
  const handler = dataHandlers.get(id)
  if (handler) handler(data)
  else pendingData.set(id, [...(pendingData.get(id) ?? []), data])
})
ipcRenderer.on('pty:exit', (_e, id: number, exitCode: number) => {
  const handler = exitHandlers.get(id)
  if (handler) handler(exitCode)
  else pendingExit.set(id, exitCode)
})

contextBridge.exposeInMainWorld('ado', {
  request: (req: unknown) => ipcRenderer.invoke('ado:request', req),
  hasPat: () => ipcRenderer.invoke('ado:hasPat'),
  defaultOrg: () => ipcRenderer.invoke('ado:defaultOrg'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
})

contextBridge.exposeInMainWorld('pty', {
  spawn: (opts: { cwd: string; cols: number; rows: number }) => ipcRenderer.invoke('pty:spawn', opts),
  write: (id: number, data: string) => ipcRenderer.invoke('pty:write', id, data),
  resize: (id: number, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', id, cols, rows),
  kill: (id: number) => ipcRenderer.invoke('pty:kill', id),
  onData: (id: number, cb: (data: string) => void) => {
    dataHandlers.set(id, cb)
    const buffered = pendingData.get(id)
    pendingData.delete(id)
    buffered?.forEach(cb)
    return () => dataHandlers.delete(id)
  },
  onExit: (id: number, cb: (exitCode: number) => void) => {
    exitHandlers.set(id, cb)
    const code = pendingExit.get(id)
    pendingExit.delete(id)
    if (code !== undefined) cb(code)
    return () => exitHandlers.delete(id)
  }
})

contextBridge.exposeInMainWorld('localRepo', {
  pickFolder: () => ipcRenderer.invoke('clone:pickFolder'),
  commandExists: (name: string) => ipcRenderer.invoke('cli:exists', name)
})
