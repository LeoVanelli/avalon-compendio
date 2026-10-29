import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { createServer } from 'node:net';
import path from 'node:path';

const project = path.resolve(import.meta.dirname, '../..');
const portServer = createServer();
const port = await new Promise((resolve, reject) => {
  portServer.once('error', reject);
  portServer.listen(0, '127.0.0.1', () => resolve(portServer.address().port));
});
await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));

const child = spawn(process.execPath, [path.join(project, 'node_modules/astro/bin/astro.mjs'), 'dev', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: project, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (data) => { output += data.toString(); });
child.stderr.on('data', (data) => { output += data.toString(); });

async function ready(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Astro encerrou antes de iniciar:\n${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await pause(300);
  }
  throw new Error(`Tempo de espera esgotado: ${url}\n${output}`);
}

try {
  const response = await ready(`http://127.0.0.1:${port}/racas/humanos/`);
  const html = await response.text();
  if (!html.includes('Humanos')) throw new Error('A rota Astro não renderizou a ficha de Humanos.');
  console.log('✓ Astro iniciou e renderizou uma ficha do compêndio.');
} finally {
  child.kill('SIGINT');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), pause(1500)]);
  if (child.exitCode === null) child.kill('SIGTERM');
}
