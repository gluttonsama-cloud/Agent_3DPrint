import { describe, expect, it } from 'vitest';
import { makeFixture } from './contracts/mock';
import { decodeProject, encodeProject, parseProject, stringifyProject } from './project-codec';
import wireText from '../tests/fixtures/v2/normal-v2.json?raw';
describe('v2 完整工程编解码', () => {
  it('共享 Python 样例与运行时逐像素一致', () => {
    const snapshot = parseProject(wireText);
    expect(snapshot).toEqual(makeFixture());
    expect(parseProject(stringifyProject(snapshot))).toEqual(snapshot);
    expect(encodeProject(snapshot)).toEqual(JSON.parse(wireText));
  });
  it('拒绝字段、像素、映射和文件大小错误', () => {
    for (const mutate of [
      (p: ReturnType<typeof makeFixture>) => { p.heights[0] = 1; },
      (p: ReturnType<typeof makeFixture>) => { p.labels[1] = 99; },
      (p: ReturnType<typeof makeFixture>) => { p.protection[1] = 8; },
      (p: ReturnType<typeof makeFixture>) => { p.heightMapping = { kind: 'design', mmPerLayer: 0.2 }; },
    ]) { const p = makeFixture(); mutate(p); expect(() => encodeProject(p)).toThrow(); }
    expect(() => decodeProject({ ...JSON.parse(wireText), extra: 1 })).toThrow();
    expect(() => parseProject(wireText, 16)).toThrow();
  });
});
