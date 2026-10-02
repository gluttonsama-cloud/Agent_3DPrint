import { expect, it } from 'vitest';
import { previewData } from './preview-model';
import { makeFixture } from './contracts/mock';

it('v2 预览读取像素高度，删除最高点不改变其余毫米比例', () => {
  const project = makeFixture();
  const before = previewData(project);
  project.heights[4] = project.heights[8] = 0;
  const after = previewData(project);
  expect(before.heights[2]).toBe(3);
  expect(after.heights[2]).toBe(3);
  expect(after.millimeters[2]).toBeCloseTo(0.3);
});

it('同高度工程的高复杂度差异也必须在创建三维数组前拒绝', () => {
  const width=512,height=512;
  const project={width,height,labels:new Array<number>(width*height).fill(1),
    regions:[{id:1,layers:5},{id:2,layers:5}]};
  const before={...project,labels:Array.from({length:width*height},(_,i)=>(i+Math.floor(i/width))%2+1)};
  expect(()=>previewData(project)).not.toThrow();
  expect(()=>previewData(project,before,2)).toThrow('复杂');
});

it('1024 像素大图的奇数列单像素细线仍逐像素保留', () => {
  const width = 1024,
    height = 1024;
  const labels = new Array<number>(width * height).fill(1);
  for (let y = 0; y < height; y++) labels[y * width + 1] = 2;
  const result = previewData({
    width,
    height,
    labels,
    regions: [
      { id: 1, layers: 0 },
      { id: 2, layers: 10 },
    ],
  });
  expect(result.width).toBe(1024);
  for (let y = 0; y < height; y++) {
    expect(result.heights[y * width + 1]).toBe(10);
    expect(result.heights[y * width]).toBe(0);
  }
});

it('复杂度过大时明确拒绝预览，而非静默丢弃细节', () => {
  const width = 512,
    height = 512;
  const labels = Array.from(
    { length: width * height },
    (_, i) => ((i + Math.floor(i / width)) % 2) + 1,
  );
  expect(() =>
    previewData({
      width,
      height,
      labels,
      regions: [
        { id: 1, layers: 0 },
        { id: 2, layers: 10 },
      ],
    }),
  ).toThrow('复杂');
});
