/** 对合并主体做局部集合运算，保留其他区域及画笔修改。 */
export function combineSubjectMask(
  current: Uint8Array,
  patch: Uint8Array,
  operation: 'keep' | 'remove',
): Uint8Array {
  if (current.length !== patch.length) throw new Error('主体掩膜尺寸不一致');
  return current.map((value, i) => operation === 'keep'
    ? (value || patch[i] ? 1 : 0)
    : (value && !patch[i] ? 1 : 0));
}
