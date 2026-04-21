import { describe, expect, it, vi } from "vitest";
import { AiApplicationService } from "../../../server/application/aiApplicationService";

describe("AiApplicationService", () => {
  it("delegates to the provider and returns sanitized text", async () => {
    const provider = { generateText: vi.fn().mockResolvedValue("  hello  ") };
    const service = new AiApplicationService(provider);

    await expect(service.generateText({ prompt: "say hello" })).resolves.toEqual({
      text: "hello",
    });
    expect(provider.generateText).toHaveBeenCalledWith({ prompt: "say hello" });
  });
});
