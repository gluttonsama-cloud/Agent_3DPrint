import {
  buildSelectionImage,
  smartSelect,
  snapOutline,
  type SelectionImage,
} from './smart-selection';
import { polygonSelection } from './trim';

let image: SelectionImage | null = null;
let rgba: Uint8ClampedArray;
let width = 0,
  height = 0;
type Request =
  | { id: number; type: 'init'; rgba: Uint8ClampedArray; width: number; height: number }
  | { id: number; type: 'smart'; seed: [number, number]; tolerance: number; allowed: Uint8Array }
  | { id: number; type: 'outline'; points: [number, number][]; snap: boolean; radius: number };
self.onmessage = (event: MessageEvent<Request>) => {
  const job = event.data;
  try {
    if (job.type === 'init') {
      rgba = job.rgba;
      width = job.width;
      height = job.height;
      image = null;
      return;
    }
    if (!rgba) throw new Error('图片尚未准备好');
    let indices: number[];
    if (job.type === 'smart') {
      image ||= buildSelectionImage(rgba, width, height);
      indices = smartSelect(image, job.seed, job.tolerance, job.allowed);
    } else {
      if (job.snap) image ||= buildSelectionImage(rgba, width, height);
      const points = job.snap && image ? snapOutline(image, job.points, job.radius) : job.points;
      indices = polygonSelection(points, width, height).filter((i) => rgba[i * 4 + 3] > 0);
    }
    const result = Uint32Array.from(indices);
    self.postMessage({ id: job.id, indices: result }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ id: job.id, error: error instanceof Error ? error.message : String(error) });
  }
};
