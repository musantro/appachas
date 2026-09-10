import { spawn } from 'node:child_process';

const children = [
  spawn('uv', ['run', '--project', 'backend', 'uvicorn', 'appachas.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000', '--no-access-log'], { stdio: 'inherit' }),
  spawn('npm', ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1'], { stdio: 'inherit' }),
];
function stop() { for (const child of children) child.kill('SIGTERM'); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => { stop(); process.exitCode = code || 0; });
