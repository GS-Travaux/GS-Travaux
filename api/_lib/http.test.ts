import { describe, expect, it, vi } from 'vitest';
import { MAX_BODY_BYTES, appUrl, bearerToken, ok, vercelHandler } from './http.js';

function fakeRes() {
  const res: any = { headers: {} as Record<string, string>, code: 0, payload: '' };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.status = (c: number) => { res.code = c; return res; };
  res.send = (p: string) => { res.payload = p; };
  return res;
}
const req = (o: any) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {}, socket: {}, ...o });

describe('vercelHandler', () => {
  it('refuse les méthodes autres que POST et les contenus non JSON', async () => {
    const fn = vi.fn(async () => ok());
    for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
      const res = fakeRes(); await vercelHandler(fn)(req({ method }) as any, res);
      expect(res.code).toBe(405); expect(res.headers.Allow).toBe('POST');
    }
    const res = fakeRes(); await vercelHandler(fn)(req({ headers: { 'content-type': 'text/plain' } }) as any, res);
    expect(res.code).toBe(415);
    expect(fn).not.toHaveBeenCalled();
  });
  it('limite la taille du corps et refuse ce qui n’est pas un objet JSON', async () => {
    const fn = vi.fn(async () => ok());
    let res = fakeRes(); await vercelHandler(fn)(req({ body: { x: 'a'.repeat(MAX_BODY_BYTES) } }) as any, res); expect(res.code).toBe(413);
    res = fakeRes(); await vercelHandler(fn)(req({ headers: { 'content-type': 'application/json', 'content-length': '999999' } }) as any, res); expect(res.code).toBe(413);
    res = fakeRes(); await vercelHandler(fn)(req({ body: [1] }) as any, res); expect(res.code).toBe(400);
    res = fakeRes(); await vercelHandler(fn)(req({ body: '{oops' }) as any, res); expect(res.code).toBe(400);
    expect(fn).not.toHaveBeenCalled();
  });
  it('pose les en-têtes de sécurité et masque les erreurs inattendues', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fakeRes(); await vercelHandler(async () => { throw new Error('secret interne'); })(req({}) as any, res);
    expect(res.code).toBe(500); expect(res.payload).not.toMatch(/secret/);
    expect(res.headers).toMatchObject({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    spy.mockRestore();
  });
  it('transmet les en-têtes en minuscules, le corps et l’adresse IP', async () => {
    const res = fakeRes(); let seen: any;
    await vercelHandler(async r => { seen = r; return ok({ a: 1 }); })(req({ headers: { 'content-type': 'application/json; charset=utf-8', Authorization: 'Bearer x', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, body: '{"k":2}' }) as any, res);
    expect(res.code).toBe(200); expect(JSON.parse(res.payload)).toEqual({ a: 1 });
    expect(seen).toMatchObject({ ip: '1.2.3.4', body: { k: 2 }, headers: { authorization: 'Bearer x' } });
  });
});
describe('bearerToken / appUrl', () => {
  it('lit le jeton Bearer', () => {
    expect(bearerToken({ authorization: 'Bearer ' + 'a'.repeat(30) })).toBe('a'.repeat(30));
    expect(bearerToken({ authorization: 'Basic abc' })).toBe('');
    expect(bearerToken({})).toBe('');
  });
  it('appUrl refuse un hôte fantaisiste', () => {
    expect(appUrl({}, { host: 'localhost:5173' })).toBe('http://localhost:5173/');
    expect(() => appUrl({}, { host: 'evil.example/@x' })).toThrow();
  });
});
