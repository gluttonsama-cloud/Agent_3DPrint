import { describe, expect, it } from 'vitest';
import { combineSubjectMask } from './subject-mask';

describe('主体直接编辑', () => {
  it('补选保留已有文字和画笔修边', () => {
    const before = new Uint8Array([1, 0, 1, 0]);
    expect([...combineSubjectMask(before, new Uint8Array([0, 1, 0, 0]), 'keep')]).toEqual([
      1, 1, 1, 0,
    ]);
    expect([...before]).toEqual([1, 0, 1, 0]);
  });
  it('排除只影响命中的局部，不能重算其余主体', () => {
    expect([
      ...combineSubjectMask(new Uint8Array([1, 1, 1, 0]), new Uint8Array([0, 1, 0, 1]), 'remove'),
    ]).toEqual([1, 0, 1, 0]);
  });
  it('拒绝尺寸不一致的预测结果', () => {
    expect(() => combineSubjectMask(new Uint8Array(4), new Uint8Array(3), 'keep')).toThrow('尺寸');
  });
});
