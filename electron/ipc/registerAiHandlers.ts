import type { IpcMain } from "electron";
import type {
  GenerateTextRequest,
  GenerateTextResponse,
} from "../../server/application/aiApplicationService";
import { WORKBENCH_CHANNELS } from "../types";

interface RegisterAiHandlersOptions {
  ipcMain: IpcMain;
  generateText: (request: GenerateTextRequest) => Promise<GenerateTextResponse>;
}

export function registerAiHandlers({
  ipcMain,
  generateText,
}: RegisterAiHandlersOptions): void {
  ipcMain.handle(WORKBENCH_CHANNELS.ai.generateText, async (_event, request) => {
    return generateText(request);
  });
}
