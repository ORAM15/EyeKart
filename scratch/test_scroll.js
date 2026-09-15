const { spawn } = require('child_process');

const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--remote-debugging-port=9286',
  '--user-data-dir=C:\\Windows\\Temp\\edge_scroll_debug',
  '--headless=new',
  '--disable-gpu',
  '--window-size=1440,900',
  'about:blank'
]);

setTimeout(async () => {
  const targets = await fetch('http://127.0.0.1:9286/json/list').then(r => r.json());
  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('edge:') && !t.url.startsWith('chrome-extension:'));
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'http://127.0.0.1:3000/Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html' } }));
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id === 1) {
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `(function() {
              window.scrollTo(0, 900);
              return {
                scrollY: window.scrollY,
                scrollTop: document.documentElement.scrollTop,
                targetP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.targetScrollProgress : -1
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 1500);
    }
    if (msg.id === 2) {
      console.log('Immediate scroll result:', msg.result.result.value);
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 3,
          method: 'Runtime.evaluate',
          params: {
            expression: `(function() {
              return {
                scrollY: window.scrollY,
                scrollTop: document.documentElement.scrollTop,
                targetP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.targetScrollProgress : -1,
                lerpedP: window.EyeKartCinematic3D ? window.EyeKartCinematic3D.scrollProgress : -1
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 800);
    }
    if (msg.id === 3) {
      console.log('After 800ms:', msg.result.result.value);
      edge.kill();
      process.exit(0);
    }
  };
}, 1500);
