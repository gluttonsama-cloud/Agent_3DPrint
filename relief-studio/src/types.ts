export interface Region {
  id: number;
  name: string;
  color: string;
  layers: number;
}
export interface Project {
  version: 1;
  name: string;
  width: number;
  height: number;
  sizeMm: [number, number];
  image: string;
  labels: number[];
  regions: Region[];
}
export interface SegmentInput {
  image: string;
  colors: number | 'auto';
  tolerance?: number;
  validMask?: number[];
  sizeMm: [number, number];
  name: string;
}
export interface Bridge {
  subject(input: {
    id: string;
    action: 'propose' | 'predict';
    image: string;
    validMask?: number[];
    points?: { x: number; y: number; label: 0 | 1 }[];
  }): Promise<{
    id: string;
    candidates?: SubjectCandidate[];
    mask?: string;
    elapsedSeconds: number;
    peakVramMB: number;
  }>;
  subjectStatus(): Promise<{ installed: boolean; directory: string }>;
  cancelSubject(): Promise<void>;
  cancelSegment(): Promise<void>;
  segment(input: SegmentInput): Promise<Project>;
  save(project: Project): Promise<{ path: string } | null>;
  open(): Promise<Project | null>;
  export(project: Project): Promise<{ path: string } | null>;
  sample(): Promise<Project>;
  appInfo(): Promise<{ version: string; platform: string }>;
}
export interface SubjectCandidate {
  id: string;
  mask: string;
  area: number;
  suggested: boolean;
  stability: number;
}
declare global {
  interface Window {
    relief?: Bridge;
  }
}
