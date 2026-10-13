const assert = require('node:assert/strict');
const { test } = require('node:test');
const { removePortraitBackground } = require('../src/services/portraitBackground');
const createRouter = require('../src/routes/portraitBackground');
const express = require('express');
const request = require('supertest');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZxkAAAAASUVORK5CYII=', 'base64');
const image = `data:image/png;base64,${png.toString('base64')}`;

test('无配置拒绝调用，非法图片在调用上游前拒绝', async () => {
  const never = () => { throw new Error('不应访问外网'); };
  await assert.rejects(removePortraitBackground(image, { apiKey: '', fetchImpl: never }),
    error => error.status === 503);
  for (const invalid of ['', 'https://example.com/a.jpg', 'data:image/jpeg;base64,aGVsbG8=']) {
    await assert.rejects(removePortraitBackground(invalid, { apiKey: 'test', fetchImpl: never }),
      error => error.status === 400);
  }
  await assert.rejects(removePortraitBackground(`data:image/png;base64,${'A'.repeat(5_000_000)}`,
    { apiKey: 'test', fetchImpl: never }), error => error.status === 413);
});

test('采用官方同步二进制协议，返回内联 PNG，不上传对象存储', async () => {
  const output = await removePortraitBackground(image, { apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://techsz.aoscdn.com/api/tasks/visual/segmentation');
      assert.equal(options.headers['X-API-KEY'], 'test-key');
      assert.equal(options.body.get('sync'), '1');
      assert.equal(options.body.get('return_type'), '3');
      assert.equal(options.body.get('crop'), '0');
      assert.equal(options.body.get('type'), 'person');
      assert.equal(options.body.get('image_file').type, 'image/png');
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    } });
  assert.equal(output, image);
});

test('超时、上游报错、伪图片与过大返回值均脱敏拒绝', async () => {
  const responses = [
    () => { throw new DOMException('secret-key', 'TimeoutError'); },
    () => new Response('secret-key', { status: 401 }),
    () => new Response('{"message":"secret-key"}', { headers: { 'content-type': 'image/png' } }),
    () => new Response(png, { headers: { 'content-length': '99999999' } }),
    () => new Response(new Uint8Array(13 * 1024 * 1024)),
  ];
  for (const response of responses) {
    await assert.rejects(removePortraitBackground(image, { apiKey: 'test', fetchImpl: response }),
      error => !error.message.includes('secret-key') && error.status >= 500);
  }
});

test('内联抠图路由成功与失败保持稳定 JSON 契约', async () => {
  const app = express();
  app.use(express.json());
  app.use('/inline', createRouter(async input => {
    if (input !== image) throw Object.assign(new Error('图片数据无效'), { status: 400 });
    return image;
  }));
  const valid = await request(app).post('/inline').send({ image });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.image, image);
  const invalid = await request(app).post('/inline').send({});
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);
});

test('付费入口拒绝未允许的来源 IP，且不信任伪造的转发头', async () => {
  const app = express();
  app.use((req, res, next) => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: '203.0.113.8' });
    next();
  });
  app.use(createRouter(() => { throw new Error('不应调用'); }, { allowedIps: [] }));
  const denied = await request(app).post('/').set('X-Forwarded-For', '127.0.0.1');
  assert.equal(denied.status, 403);
});

test('默认拒绝第三方网页从浏览器借用本机的抠图额度', async () => {
  const app = express();
  app.use(createRouter(() => { throw new Error('不应调用'); }));
  const denied = await request(app).post('/').set('Origin', 'https://untrusted.example');
  assert.equal(denied.status, 403);
});

test('抠图入口限制并发，调用结束后释放名额，并限制窗口内次数', async () => {
  const app = express();
  app.use(createRouter(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return image;
  }, { concurrency: 1, perIpLimit: 2 }));
  const parallel = await Promise.all([request(app).post('/'), request(app).post('/')]);
  assert.deepEqual(parallel.map(response => response.status).sort(), [200, 429]);
  assert.equal((await request(app).post('/')).status, 200);
  assert.equal((await request(app).post('/')).status, 429);
});
