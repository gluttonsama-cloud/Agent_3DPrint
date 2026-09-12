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
  refine(input: {
    id: string;
    project: Project;
    target: number;
    background: number;
    box: [number, number, number, number];
    mode: 'text' | 'solid';
    hints: number[];
  }): Promise<RefineResult>;
  repair(input: {
    project: Project;
    target: number;
    background: number;
    radius: number;
    specks: number;
    symmetry: boolean;
  }): Promise<RepairResult>;
  subject(input: {
    id: string;
    action: 'propose' | 'predict';
    image: string;
    validMask?: number[];
    points?: { x: number; y: number; label: 0 | 1 }[];
    box?: [number, number, number, number];
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
export interface RefineResult {
  project: Project;
  mask: string;
  addedMask: string;
  removedMask: string;
  uncertainMask: string;
  added: number;
  removed: number;
  uncertain: number;
  changes: [number, number, number, number][];
  changeCount: number;
}
export interface RepairResult {
  project: Project;
  added: number;
  removed: number;
  symmetryApplied: boolean;
  symmetryScore: number | null;
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
