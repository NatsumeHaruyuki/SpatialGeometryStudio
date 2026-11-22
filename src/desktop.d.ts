import type { Scene } from './schema/scene';
export type DataInfo = { mode: 'portable' | 'standard'; path: string; warning: string | null };
export type FileResult = { canceled: true } | { canceled: false; name: string; scene?: Scene };
declare global {
  interface Window {
    studio?: {
      openProject: () => Promise<FileResult>;
      saveProject: (scene: Scene, asJson?: boolean) => Promise<FileResult>;
      exportPNG: (data: string) => Promise<FileResult>;
      dataInfo: () => Promise<DataInfo>;
      setDataMode: (mode: 'portable' | 'standard') => Promise<DataInfo>;
      setDirty: (dirty: boolean) => void;
      copyPrompt: () => Promise<void>;
      copyImportRepair: (input: string, error: string) => Promise<void>;
    };
  }
}
