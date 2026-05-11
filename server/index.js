import { app, port } from './app.js';
import { initDb, checkDb } from './db.js';

async function start() {
  const db = await checkDb();
  if (!db.ok) { console.error('[server] DB failed:', db.error); process.exit(1); }
  console.log('[server] DB connected');
  await initDb();
  console.log('[server] Tables initialized');
  app.listen(port, () => console.log(`[server] AI Script Kill on http://localhost:${port}`));
}
start();
