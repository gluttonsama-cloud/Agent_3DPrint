import { describe, expect, it } from 'vitest';
import { initialSizeMm, resizeMm } from './physical-size';

describe('成品尺寸比例', () => {
  it('裁剪后的横竖图均以长边 55 mm 初始化', () => {
    expect(initialSizeMm(500, 658)).toEqual([55 * 500 / 658, 55]);
    expect(initialSizeMm(658, 500)).toEqual([55, 55 * 500 / 658]);
    expect(initialSizeMm(410, 410)).toEqual([55, 55]);
  });
  it('锁定时沿用当前工程比例，解锁时只改变一个尺寸', () => {
    expect(resizeMm([40, 60], 0, 80, true)).toEqual([80, 120]);
    expect(resizeMm([40, 60], 1, 30, true)).toEqual([20, 30]);
    expect(resizeMm([40, 60], 0, 80, false)).toEqual([80, 60]);
  });
  it('联动尺寸超出范围时拒绝，避免静默改变比例', () => {
    expect(() => resizeMm([1, 100], 0, 200, true)).toThrow();
    expect(() => resizeMm([100, 1], 0, 0.1, true)).toThrow();
  });
  it('极细图初始化仍可编辑，解锁允许保留旧工程的小尺寸', () => {
    expect(initialSizeMm(1, 2048)).toEqual([0.1, 204.8]);
    expect(resizeMm([0.02, 55], 1, 60, false)).toEqual([0.02, 60]);
  });
});
