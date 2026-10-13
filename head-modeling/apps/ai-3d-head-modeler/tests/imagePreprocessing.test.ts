import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cropRectangle, fitDimensions, parseImageSource } from '../src/services/imagePreprocessing';

test('长边限制为 2048，横竖图等比缩放，小图不放大', () => {
  assert.deepEqual(fitDimensions(4000, 3000), { width: 2048, height: 1536 });
  assert.deepEqual(fitDimensions(3000, 4000), { width: 1536, height: 2048 });
  assert.deepEqual(fitDimensions(320, 640), { width: 320, height: 640 });
  assert.throws(() => fitDimensions(0, 640));
  assert.throws(() => fitDimensions(Infinity, 640));
});

test('百分比裁剪准确映射到源图，不改变选中区域比例', () => {
  assert.deepEqual(cropRectangle(1000, 2000,
    { left: 60, right: 10, top: 0, bottom: 0 }),
  { x: 600, y: 0, width: 300, height: 2000 });
  assert.deepEqual(cropRectangle(1000, 2000, { left: 10, right: 20, top: 5, bottom: 15 }),
    { x: 100, y: 100, width: 700, height: 1600 });
  assert.throws(() => cropRectangle(1000, 2000,
    { left: 90, right: 20, top: 0, bottom: 0 }));
  assert.throws(() => cropRectangle(1000, 2000,
    { left: NaN, right: 0, top: 0, bottom: 0 }));
  assert.throws(() => cropRectangle(1000, 2000,
    { left: 50, right: 50, top: 0, bottom: 0 }));
});

test('Base64 和 Data URL 仅接收支持的图片，拒绝远程 URL 与非法内容', () => {
  const jpeg = '/9j/AA==';
  assert.equal(parseImageSource(jpeg).type, 'image/jpeg');
  assert.equal(parseImageSource(`data:image/jpeg;base64,${jpeg}`).size, 4);
  assert.throws(() => parseImageSource('https://example.com/photo.png'));
  assert.throws(() => parseImageSource('data:image/svg+xml;base64,PHN2Zz4='));
  assert.throws(() => parseImageSource('not base64!'));
  assert.throws(() => parseImageSource('data:image/png;base64,/9j/AA=='));
});
