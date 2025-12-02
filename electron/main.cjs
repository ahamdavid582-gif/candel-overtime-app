const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    // When packaged, renderer files are usually inside resources (asar) or resources/dist.
    const candidates = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html')
    ];

    let loaded = false;
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          win.loadFile(p);
          loaded = true;
          break;
        }
      } catch (e) {
        // ignore and try next
      }
    }

    if (!loaded) {
      // Last-resort: try loading index.html relative to cwd (should rarely be needed)
      const fallback = path.join(process.cwd(), 'dist', 'index.html');
      if (fs.existsSync(fallback)) {
        win.loadFile(fallback);
        loaded = true;
      }
    }

    if (!loaded) {
      // If nothing worked, show a helpful message in a blank page
      win.loadURL('data:text/html,<h1>Renderer not found</h1><p>index.html not located in packaged app.</p>');
    }

    // Allow turning on DevTools in packaged mode for debugging
    if (process.env.DEBUG_ELECTRON === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    // during development, load vite dev server
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
