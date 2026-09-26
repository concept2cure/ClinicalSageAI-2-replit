// One AnA turn over the /ana socket namespace, printed as the events arrive.
//   node socket-turn.mjs <base-url> <token-file> "<message>"
import { io } from 'socket.io-client';
import fs from 'node:fs';

const [base, tokenFile, message] = process.argv.slice(2);
const socket = io(`${base}/ana`, { auth: { token: fs.readFileSync(tokenFile, 'utf8').trim() }, transports: ['websocket'] });
const timer = setTimeout(() => { console.log(JSON.stringify({ event: 'timeout' })); process.exit(1); }, 60000);
socket.on('connect_error', (e) => { console.log(JSON.stringify({ event: 'connect_error', error: e.message })); process.exit(1); });
socket.on('connect', () => socket.emit('ana:message', { turnId: 'live-1', message }));
for (const ev of ['ana:tool', 'ana:done', 'ana:error']) {
  socket.on(ev, (p) => {
    console.log(JSON.stringify({ event: ev, ...p, text: p.text ? String(p.text).slice(0, 80) : undefined }));
    if (ev !== 'ana:tool') { clearTimeout(timer); socket.close(); process.exit(0); }
  });
}
