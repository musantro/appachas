import { existsSync, mkdirSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = new URL('../.local/postgres', import.meta.url).pathname;
mkdirSync(new URL('../.local', import.meta.url), { recursive: true });
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'appachas',
  password: 'appachas',
  port: 54322,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic'],
  onLog: () => {},
  onError: (message) => { if (String(message).includes('FATAL')) console.error('PostgreSQL could not start. Check port 54322.'); },
});
if (!existsSync(`${databaseDir}/PG_VERSION`)) await postgres.initialise();
await postgres.start();
const client = postgres.getPgClient();
await client.connect();
const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'appachas'");
await client.end();
if (!rows.length) await postgres.createDatabase('appachas');
console.log('Local PostgreSQL ready on 127.0.0.1:54322 (database: appachas). Ctrl+C stops it; data is preserved.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await postgres.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise(() => {});
