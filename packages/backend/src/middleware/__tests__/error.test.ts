import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'bun:test';
import { createErrorHandler } from '../error';
import { requestLog } from '../requestLog';

afterEach(() => vi.restoreAllMocks());

describe('error handler', () => {
  it('logs an unexpected error WITH its stack and request id, and leaks neither to the client', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const app = express();
    app.use(requestLog());
    app.get('/boom', () => {
      throw new Error('database exploded');
    });
    app.use(createErrorHandler(false));

    const res = await request(app).get('/boom?secret=1').set('x-request-id', 'trace-42');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(res.headers['cache-control']).toBe('no-store');

    const lines = stderr.mock.calls.map(
      ([chunk]) => JSON.parse(String(chunk)) as Record<string, unknown>,
    );
    const logged = lines.find((line) => line.message === 'unhandled error');
    expect(logged).toMatchObject({
      requestId: 'trace-42',
      method: 'GET',
      path: '/boom',
      error: 'database exploded',
    });
    expect(String(logged?.stack)).toContain('database exploded');
    // The request line itself is an error-level line too, and never carries the query string.
    expect(lines.find((line) => line.message === 'request')).toMatchObject({
      status: 500,
      path: '/boom',
    });
  });
});

describe('request log', () => {
  it('logs the full path of a request served by a mounted router, without its query', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const app = express();
    app.use(requestLog());
    const api = express.Router();
    api.get('/articles', (_req, res) => {
      res.json([]);
    });
    app.use('/api', api);

    await request(app).get('/api/articles?q=secret-search').expect(200);
    const lines = stdout.mock.calls.map(
      ([chunk]) => JSON.parse(String(chunk)) as Record<string, unknown>,
    );
    expect(lines.find((line) => line.message === 'request')).toMatchObject({
      path: '/api/articles',
      status: 200,
    });
    expect(JSON.stringify(lines)).not.toContain('secret-search');
  });
});
