import { createOpenAI } from "@ai-sdk/openai";

export const DEFAULT_ARK_MODEL_ID = "ep-20260417212516-rpphh";

export function createArkClient() {
  return createOpenAI({
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: process.env.ARK_API_KEY ?? process.env.OPENAI_API_KEY,
    compatibility: "compatible"
  } as any);
}

export function getArkModel(modelId?: string) {
  const client = createArkClient();
  return client.chat(modelId ?? process.env.ARK_MODEL_ID ?? DEFAULT_ARK_MODEL_ID);
}
