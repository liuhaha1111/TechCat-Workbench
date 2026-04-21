export interface GenerateTextRequest {
  prompt: string;
}

export interface GenerateTextResponse {
  text: string;
}

export interface AiClient {
  generateText(request: GenerateTextRequest): Promise<GenerateTextResponse>;
}

function requireWorkbenchBridge() {
  if (typeof window === "undefined" || !window.workbench) {
    throw new Error("Electron preload bridge is not available.");
  }

  return window.workbench;
}

export const aiClient: AiClient = {
  generateText(request) {
    return requireWorkbenchBridge().ai.generateText(request);
  },
};
