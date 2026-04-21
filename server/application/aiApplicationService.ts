export interface GenerateTextRequest {
  prompt: string;
}

export interface GenerateTextResponse {
  text: string;
}

export interface AiTextProvider {
  generateText(request: GenerateTextRequest): Promise<string>;
}

function sanitizeText(text: string): string {
  return text.trim();
}

export class AiApplicationService {
  constructor(private readonly provider: AiTextProvider) {}

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResponse> {
    const text = await this.provider.generateText(request);
    return {
      text: sanitizeText(text),
    };
  }
}
