import { describe, expect, it } from 'vitest';
import { buildSelectionImage, smartSelect, snapOutline } from './smart-selection';

type Color = [number, number, number, number];

function makeImage(width: number, height: number, pixel: (x: number, y: number) => Color) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.set(pixel(x, y), (y * width + x) * 4);
  }
  return buildSelectionImage(rgba, width, height);
}

describe('smart color selection', () => {
  it('selects a noisy connected letter while keeping equal-luminance colors separate', () => {
    const image = makeImage(12, 8, (x, y) => {
      if (x >= 2 && x <= 5 && y >= 1 && y <= 6) {
        const noise = ((x * 7 + y * 11) % 13) - 6;
        return [100 + noise, 150 - noise, 40 + noise, 255];
      }
      // 近似相同亮度，但颜色明显不同。
      return [196, 101, 40, 255];
    });
    const result = smartSelect(image, [3, 3], 24);
    expect(result).toHaveLength(24);
    expect(result).not.toContain(3 * 12 + 6);
  });

  it('respects alpha, current-layer mask, and connectivity', () => {
    const image = makeImage(5, 3, (x, y) => [80, 120, 160, x === 2 ? 0 : 255]);
    const allowed = new Uint8Array(15).fill(1);
    allowed[1] = 0;
    expect(smartSelect(image, [0, 1], 80, allowed).sort((a, b) => a - b)).toEqual([
      0, 5, 6, 10, 11,
    ]);
    expect(smartSelect(image, [3, 1], 80, allowed).sort((a, b) => a - b)).toEqual([
      3, 4, 8, 9, 13, 14,
    ]);
    expect(smartSelect(image, [2, 1], 80, allowed)).toEqual([]);
    expect(smartSelect(image, [1, 0], 80, allowed)).toEqual([]);
    expect(smartSelect(image, [-1, 0], 80)).toEqual([]);
    expect(smartSelect(image, [5, 0], 80)).toEqual([]);
  });

  it('does not cross a narrow different-color boundary even when the far side matches', () => {
    const image = makeImage(7, 3, (x) => (x === 3 ? [240, 20, 20, 255] : [20, 50, 170, 255]));
    const result = smartSelect(image, [1, 1], 24);
    expect(result).toHaveLength(9);
    expect(result.every((i) => i % 7 < 3)).toBe(true);
  });

  it('uses the surrounding color for an isolated noisy seed but preserves a thin stroke', () => {
    const noisy = makeImage(7, 7, (x, y) =>
      x === 3 && y === 3 ? [235, 12, 190, 255] : [75, 130, 180, 255],
    );
    expect(smartSelect(noisy, [3, 3], 24)).toHaveLength(49);

    const thin = makeImage(7, 7, (x) => (x === 3 ? [235, 12, 190, 255] : [75, 130, 180, 255]));
    expect(smartSelect(thin, [3, 3], 24)).toHaveLength(7);
  });

  it('stops a gradual color ramp at the seed-relative tolerance', () => {
    const image = makeImage(20, 3, (x) => [40 + x * 5, 80 + x * 5, 120 + x * 5, 255]);
    const result = smartSelect(image, [0, 1], 24);
    expect(result).toHaveLength(15);
    expect(result.every((i) => i % 20 <= 4)).toBe(true);
  });

  it('uses a safe tolerance when the caller passes a non-finite value', () => {
    const image = makeImage(3, 1, (x) => (x < 2 ? [30, 60, 90, 255] : [230, 220, 210, 255]));
    expect(smartSelect(image, [0, 0], Number.NaN)).toHaveLength(2);
  });
});

describe('magnetic outline', () => {
  it('attracts a jittery drawn edge to a sharp color edge without spikes', () => {
    const image = makeImage(30, 30, (x) => (x < 15 ? [20, 40, 180, 255] : [240, 210, 40, 255]));
    const points: [number, number][] = [
      [12, 3],
      [13, 5],
      [12, 7],
      [13, 9],
      [12, 11],
      [13, 13],
      [12, 15],
      [13, 17],
      [12, 19],
      [13, 21],
      [12, 23],
      [4, 23],
      [4, 3],
      [12, 3],
    ];
    const result = snapOutline(image, points, 4);
    expect(result).toHaveLength(points.length);
    expect(result.at(-1)).toEqual(result[0]);
    for (let i = 2; i < 9; i++) {
      expect(result[i][0]).toBeGreaterThanOrEqual(13.5);
      expect(result[i][0]).toBeLessThanOrEqual(15.5);
      expect(Math.abs(result[i][0] - result[i - 1][0])).toBeLessThan(2);
    }
  });

  it('preserves a drawn polygon when there are no edges nearby', () => {
    const image = makeImage(25, 25, () => [100, 100, 100, 255]);
    const points: [number, number][] = [
      [3, 3],
      [21, 3],
      [21, 21],
      [3, 21],
    ];
    expect(snapOutline(image, points, 8)).toEqual(points);
  });

  it('follows the closer of two strong parallel edges', () => {
    const image = makeImage(32, 32, (x) =>
      x < 11 ? [10, 30, 80, 255] : x < 18 ? [245, 220, 120, 255] : [10, 30, 80, 255],
    );
    const points: [number, number][] = [];
    for (let y = 3; y < 29; y += 2) points.push([12, y]);
    points.push([4, 28], [4, 3]);
    const result = snapOutline(image, points, 8);
    for (let i = 2; i < 11; i++) expect(result[i][0]).toBeLessThan(13);
  });

  it('keeps canvas-edge vertices at width/height so the last row and column remain enclosed', () => {
    const image = makeImage(8, 8, (x, y) =>
      x < 6 && y < 6 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const canvasOutline: [number, number][] = [
      [0, 0],
      [8, 0],
      [8, 8],
      [0, 8],
      [0, 0],
    ];
    const result = snapOutline(image, canvasOutline, 4);
    expect(result).toEqual(canvasOutline);
    expect(result[2][0]).toBeGreaterThan(7.5);
    expect(result[2][1]).toBeGreaterThan(7.5);
  });

  it('validates dimensions and keeps out-of-range paths in canvas bounds', () => {
    expect(() => buildSelectionImage(new Uint8ClampedArray(3), 2, 2)).toThrow(RangeError);
    const image = makeImage(8, 8, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const result = snapOutline(
      image,
      [
        [-2, 1],
        [5, 1],
        [5, 7],
        [-2, 7],
      ],
      20,
    );
    expect(result.every(([x, y]) => x >= 0 && x <= 8 && y >= 0 && y <= 8)).toBe(true);
  });
});
