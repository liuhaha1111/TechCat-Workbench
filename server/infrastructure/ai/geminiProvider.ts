import { GoogleGenAI } from "@google/genai";
import type {
  AiTextProvider,
  GenerateTextRequest,
} from "../../application/aiApplicationService";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type GeminiClient = {
  models: {
    generateContent(options: {
      model: string;
      contents: string;
    }): Promise<{ text?: string | null }>;
  };
};

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return apiKey;
}

export class GeminiProvider implements AiTextProvider {
  private readonly client: GeminiClient;

  constructor(
    client: GeminiClient = new GoogleGenAI({ apiKey: getGeminiApiKey() }),
    private readonly model = DEFAULT_GEMINI_MODEL
  ) {
    this.client = client;
  }

  async generateText(request: GenerateTextRequest): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: request.prompt,
    });

    return response.text ?? "";
  }
}
