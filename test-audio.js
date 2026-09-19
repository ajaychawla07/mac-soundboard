const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.webContents.on('console-message', (event, level, message) => {
    console.log('[Renderer Log]:', message);
  });

  const testFile = path.join(__dirname, 'assets', 'sounds', 'airhorn.wav');
  const buffer = fs.readFileSync(testFile);
  console.log('Main process read buffer size:', buffer.length);

  await win.loadURL(`data:text/html,
    <html><body>
    <script>
      const fs = require('fs');
      const testFile = "${testFile.replace(/\\/g, '\\\\')}";
      console.log('Loading file in renderer:', testFile);
      try {
        const buf = fs.readFileSync(testFile);
        console.log('Renderer read buffer size:', buf.byteLength);
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Initial ctx state:', ctx.state);
        ctx.decodeAudioData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), (decoded) => {
          console.log('Decoded buffer duration:', decoded.duration, 'channels:', decoded.numberOfChannels);
          window.decodedSuccess = true;
        }, (err) => {
          console.error('Decode error:', err);
        });
      } catch (e) {
        console.error('Catch error:', e.message);
      }
    </script>
    </body></html>
  `);

  setTimeout(() => {
    app.quit();
  }, 1500);
});
