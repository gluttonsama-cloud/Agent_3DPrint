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
  colors: number;
  sizeMm: [number, number];
  name: string;
}
export interface Bridge {
  segment(input: SegmentInput): Promise<Project>;
  save(project: Project): Promise<{ path: string } | null>;
  open(): Promise<Project | null>;
  export(project: Project): Promise<{ path: string } | null>;
  sample(): Promise<Project>;
  appInfo(): Promise<{ version: string; platform: string }>;
}
declare global {
  interface Window {
    relief?: Bridge;
  }
}
