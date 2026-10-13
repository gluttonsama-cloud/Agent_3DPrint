const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const app = require('../src/app');

let server;
let baseUrl;

before(async () => {
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

test('建模服务健康检查可访问', async () => {
  for (const route of ['/health', '/api/health', '/api/health/live', '/api/health/ready']) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, route);
  }
});

test('封存的 API 不再暴露', async () => {
  const routes = [
    '/api/orders', '/api/devices', '/api/materials', '/api/dashboard',
    '/api/agents', '/api/agent-decisions', '/api/agent-workflow/process-order',
    '/api/decision-logs', '/api/performance', '/api/payment', '/api/debug/tasks'
  ];
  for (const route of routes) {
    for (const method of ['GET', 'POST']) {
      const response = await fetch(`${baseUrl}${route}`, { method });
      assert.equal(response.status, 404, `${method} ${route}`);
    }
  }
});

test('缺少照片的上传与抠图请求在本地拒绝', async () => {
  for (const route of ['/api/upload', '/api/remove-background']) {
    const response = await fetch(`${baseUrl}${route}`, { method: 'POST' });
    assert.equal(response.status, 400, route);
  }
});

test('未知任务查询与下载仍经过建模路由', async () => {
  const id = 'task-1234567890-1234abcd';
  for (const route of [`/api/status/${id}`, `/api/download/${id}`]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404, route);
    const expectedError = route.startsWith('/api/status/') ? '任务不存在' : 'TASK_NOT_FOUND';
    assert.equal((await response.json()).error, expectedError);
  }
});

test('API 文档仅包含当前功能', () => {
  const spec = require('../src/config/swagger');
  assert.ok(spec.paths['/api/upload']);
  assert.ok(spec.paths['/api/status/{taskId}']);
  assert.ok(!Object.keys(spec.paths).some(route => /orders|devices|materials|agents/.test(route)));
});

test('正式入口不加载封存模块', () => {
  const modules = Object.keys(require.cache);
  assert.ok(!modules.some(file => /[\\/]archive[\\/]/.test(file)));
  assert.ok(!modules.some(file => /[\\/](agents|queues|workers|models|states)[\\/]/.test(file)));
});
