import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ado', {
  request: (req: unknown) => ipcRenderer.invoke('ado:request', req),
  hasPat: () => ipcRenderer.invoke('ado:hasPat'),
  defaultOrg: () => ipcRenderer.invoke('ado:defaultOrg'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
})
