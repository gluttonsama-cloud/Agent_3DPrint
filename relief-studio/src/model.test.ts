import { describe, expect, it } from 'vitest';
import { connectedSelection, heightValues, mergeRegions, paintLabels, nextRegionId } from './model';

describe('区域编辑与高度一致性', () => {
  it('新区域在合法编号范围内分配空闲 ID', () => {
    expect(nextRegionId([{ id: 1 }, { id: 65535 }])).toBe(2);
  });
  it('连通选择不误选远处同色区域，并保留孔洞', () => {
    expect(connectedSelection([1, 0, 1, 1, 0, 1], 3, 2, 0)).toEqual([0, 3]);
  });
  it('高度取决于区域层数而非颜色', () => {
    expect(
      Array.from(
        heightValues(
          [1, 0, 2],
          [
            { id: 1, layers: 0 },
            { id: 2, layers: 10 },
          ],
        ),
      ),
    ).toEqual([0, 0, 10]);
  });
  it('画笔不污染透明像素且不修改旧数组，支持撤销快照', () => {
    const before = [1, 0, 2];
    expect(paintLabels(before, [0, 1, 2], 2, [255, 0, 255])).toEqual([2, 0, 2]);
    expect(before).toEqual([1, 0, 2]);
  });
  it('合并仅替换指定区域', () => {
    expect(mergeRegions([0, 1, 2, 3], 2, 1)).toEqual([0, 1, 1, 3]);
  });
});
