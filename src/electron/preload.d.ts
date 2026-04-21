import type { WorkbenchApi } from "../../electron/types";

declare global {
  interface Window {
    workbench: WorkbenchApi;
  }
}

export {};
