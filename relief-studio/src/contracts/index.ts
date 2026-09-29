/** D1 候选协议。B 联调通过后冻结；v1 Bridge 保持不变。 */
export const LIMITS = { edge: 2048, layers: 256, fileBytes: 128 * 1024 ** 2,
  historyBytes: 64 * 1024 ** 2 } as const;
export const PROTECTION = { range: 1, color: 2, height: 4 } as const;
export interface VersionStamp { sessionId: string; revision: number }
export interface RegionV2 { id: number; name: string; color: string; defaultLayers: number }
export interface DeviceProfile {
  id: string;
  name: string;
  verified: boolean;
  whitePolarity: 'white-is-ink' | 'black-is-ink' | 'unknown';
  automaticWhite: 'enabled' | 'disabled' | 'unknown';
  colorSpace: 'RGB' | 'CMYK';
  iccPath: string | null;
}
export interface ProjectSnapshot extends VersionStamp {
  version: 2;
  name: string;
  width: number;
  height: number;
  sizeMm: [number, number];
  original: Uint8Array; // RGBA，方向校正和裁剪后的原始工作图
  colors: Uint8Array; // RGBA，编辑彩图
  labels: Uint16Array; // 0 不打印；非零必须引用 regions
  heights: Uint16Array; // 白墨总层数，0..256
  protection: Uint8Array; // 位集合 0..7
  regions: RegionV2[];
  heightMapping: { kind: 'design'; mmPerLayer: number } |
    { kind: 'calibrated'; profileId: string; mmByLayer: number[] };
  device: DeviceProfile;
}
export interface SelectionMask { width: number; height: number; data: Uint8Array }
export type RasterField = 'original' | 'colors' | 'labels' | 'heights' | 'protection';
export interface RasterBlock {
  field: Exclude<RasterField, 'original'>;
  offset: number; // 类型数组元素偏移，颜色按 RGBA 字节
  before: Uint8Array | Uint16Array;
  after: Uint8Array | Uint16Array;
}
export type ProjectProperties = Pick<ProjectSnapshot,
  'regions' | 'name' | 'sizeMm' | 'device' | 'heightMapping'>;
export interface EditPatch {
  base: VersionStamp;
  description: string;
  blocks: RasterBlock[];
  properties?: { before: ProjectProperties; after: ProjectProperties };
}
export type OperationResult<T> =
  | { status: 'success'; base: VersionStamp; value: T }
  | { status: 'cancelled'; base: VersionStamp }
  | { status: 'error'; base: VersionStamp; code: string; message: string };
export type HeightOperation =
  | { kind: 'set' | 'uniform'; layers: number }
  | { kind: 'add'; delta: number }
  | { kind: 'scale'; factor: number }
  | { kind: 'suggest'; maxLayers: number }
  | { kind: 'bevel' | 'smooth'; radiusPx: number };
export interface HeightRequest {
  snapshot: ProjectSnapshot;
  selection?: SelectionMask; // 省略为全图；全零为无选中像素
  operation: HeightOperation;
}
export interface RecognitionRequest {
  snapshot: ProjectSnapshot;
  selection?: SelectionMask;
  keepBackground: boolean;
  protectionPolicy: 'preserve' | 'overwrite';
}
export interface ImportRequest {
  requestId: string;
  imageDataUrl: string;
  sizeMm: [number, number];
  keepBackground: boolean;
}
export interface ExportRequest {
  snapshot: ProjectSnapshot;
  device: DeviceProfile;
  formats: ('png' | 'jpg')[];
  obj: boolean;
  outputDirectory: string;
}
export interface ExportResult {
  outputDirectory: string;
  files: { path: string; role: 'project' | 'color' | 'coverage' | 'height' | 'white' | 'obj' }[];
  checks: { code: string; status: 'passed' | 'warning' | 'failed'; message: string }[];
  simulated: boolean;
}
export interface CapabilityService {
  height(input: HeightRequest, signal?: AbortSignal): Promise<OperationResult<EditPatch>>;
  recognition(input: RecognitionRequest, signal?: AbortSignal): Promise<OperationResult<EditPatch>>;
  export(input: ExportRequest, signal?: AbortSignal): Promise<OperationResult<ExportResult>>;
}
export interface HeightPanelProps {
  snapshot: ProjectSnapshot;
  selection?: SelectionMask;
  busy: boolean;
  onPreview: (operation: HeightOperation | null) => void;
  onRequest: (request: HeightRequest) => void;
  onCancel: () => void;
}
export interface ExportPanelProps {
  snapshot: ProjectSnapshot;
  devices: DeviceProfile[];
  busy: boolean;
  progress: { completed: number; total: number; message: string } | null;
  onRequest: (request: ExportRequest) => void;
  onCancel: () => void;
}
export interface EncodedRaster {
  type: 'uint8' | 'uint16'; encoding: 'base64-le'; data: string;
}
export type PersistedProjectV2 = Omit<ProjectSnapshot, RasterField> &
  Record<RasterField, EncodedRaster>;
export interface IpcRequest<T> { requestId: string; payload: T }
export interface CancelRequest { requestId: string }
