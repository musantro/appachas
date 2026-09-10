import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyProduction(url = 'https://appachas.es', request = fetch) {
  const origin = new URL(url);
  const get = (path) => request(new URL(path, origin), { redirect: 'error' });
  const index = await get('/');
  if (!index.ok || !index.headers.get('content-type')?.includes('text/html')) throw new Error('Production frontend is unavailable');
  const html = await index.text();
  if (!html.includes('Appachas') || !html.includes('id="root"')) throw new Error('Unexpected production frontend');
  const asset = html.match(/src="([^"]+\.js)"/);
  if (!asset || !(await get(asset[1])).ok) throw new Error('Production JavaScript asset is unavailable');
  const health = await get('/api/health');
  if (!health.ok || !health.headers.get('content-type')?.includes('application/json')) throw new Error('Production API is unavailable');
  const route = await get('/g/options');
  if (!route.ok || !route.headers.get('content-type')?.includes('text/html')) throw new Error('Production client routing is unavailable');
  const missing = await get('/api/not-a-route');
  if (missing.status !== 404) throw new Error('Unknown API routes must remain 404');

  if (origin.origin === 'https://appachas.es') {
    // No real group identifiers or credentials are needed to verify routing.
    const path = '/g/options?group=domain-smoke';
    const redirected = await request(new URL(path, 'https://www.appachas.es'), { redirect: 'manual' });
    if (![307, 308].includes(redirected.status) || redirected.headers.get('location') !== new URL(path, origin).href) {
      throw new Error('www must redirect to appachas.es, preserving the path and query');
    }
  }
  return origin.origin;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = await verifyProduction(process.argv[2]);
  console.log(`Production frontend, static assets, client routing and FastAPI verified at ${origin}`);
}
