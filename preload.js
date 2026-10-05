const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  syncPro:()=>ipcRenderer.invoke('sync-pro'),
  testRiot:data=>ipcRenderer.invoke('test-riot',data),
  roster:()=>ipcRenderer.invoke('roster'),dataset:()=>ipcRenderer.invoke('dataset'),
  importCSV:()=>ipcRenderer.invoke('import'),saveDraft:data=>ipcRenderer.invoke('save-draft',data),
  loadDraft:()=>ipcRenderer.invoke('load-draft'),source:()=>ipcRenderer.invoke('source')
});
