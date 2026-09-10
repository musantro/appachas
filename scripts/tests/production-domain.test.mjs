import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyProduction } from '../smoke-production.mjs';

function application({ redirect = 'https://appachas.es/g/options?group=domain-smoke', redirectStatus = 308, missingStatus = 404 } = {}) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url.hostname === 'www.appachas.es') return new Response(null, { status: redirectStatus, headers: { location: redirect } });
    if (url.pathname === '/api/health') return Response.json({ status: 'ok' });
    if (url.pathname === '/api/not-a-route') return new Response(null, { status: missingStatus });
    if (url.pathname === '/assets/app.js') return new Response('app();');
    return new Response('<title>Appachas</title><div id="root"></div><script src="/assets/app.js"></script>', { headers: { 'content-type': 'text/html' } });
  };
  return { request, calls };
}

test('the default smoke checks the custom domain and the www redirect', async () => {
  const { request, calls } = application();
  assert.equal(await verifyProduction(undefined, request), 'https://appachas.es');
  assert.equal(calls.length, 6);
  assert.ok(calls.slice(0, 5).every(({ url, options }) => url.origin === 'https://appachas.es' && options.redirect === 'error'));
  assert.equal(calls[5].url.origin, 'https://www.appachas.es');
  assert.equal(calls[5].options.redirect, 'manual');
});

test('the previous domain is checked independently without following redirects', async () => {
  const { request, calls } = application();
  assert.equal(await verifyProduction('https://appachas.vercel.app', request), 'https://appachas.vercel.app');
  assert.equal(calls.length, 5);
  assert.ok(calls.every(({ url, options }) => url.origin === 'https://appachas.vercel.app' && options.redirect === 'error'));
});

test('local built previews remain supported without a custom-domain dependency', async () => {
  const { request, calls } = application();
  assert.equal(await verifyProduction('http://localhost:4173', request), 'http://localhost:4173');
  assert.equal(calls.length, 5);
});

test('www cannot serve a duplicate app or redirect to another host or lose the group path', async () => {
  for (const options of [
    { redirectStatus: 200 },
    { redirect: 'https://appachas.vercel.app/g/options?group=domain-smoke' },
    { redirect: 'https://appachas.es/' },
    { redirect: 'https://appachas.es/g/options' },
  ]) {
    await assert.rejects(verifyProduction(undefined, application(options).request), /www must redirect/);
  }
});

test('the temporary method-preserving redirect used by Vercel is accepted too', async () => {
  await verifyProduction(undefined, application({ redirectStatus: 307 }).request);
});

test('unknown API routes cannot be hidden by the SPA fallback', async () => {
  await assert.rejects(verifyProduction(undefined, application({ missingStatus: 200 }).request), /must remain 404/);
});
