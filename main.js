// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Optional, for advanced interaction
            nodeIntegration: true, // Be cautious with this in complex apps
            contextIsolation: false // Simplifies getting started
        }
    });

    // Load your existing HTML file into the window.
    mainWindow.loadFile('shift_managers.html');

    // Open the DevTools (like Chrome's inspect element). Remove this for the final version.
    // mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished initialization.
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
