export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 使用实际画布边界转换，滚动和平移已经反映在 left／top 中。
export function screenToImage(
  clientX: number,
  clientY: number,
  bounds: CanvasBounds,
  width: number,
  height: number,
  includeBoundary = false,
): [number, number] {
  if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) {
    throw new Error('画布尺寸必须大于零');
  }
  const inset = includeBoundary ? 0 : 1;
  return [
    Math.max(
      0,
      Math.min(width - inset, Math.floor(((clientX - bounds.left) * width) / bounds.width)),
    ),
    Math.max(
      0,
      Math.min(height - inset, Math.floor(((clientY - bounds.top) * height) / bounds.height)),
    ),
  ];
}

export function isEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest('input,select,textarea,[role="dialog"]'))
  );
}
