import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { searchChunksBySpotName } from "./qdrant";
import type { LandmarkChunk } from "./qdrant";

// ── 模型配置（与 tools.ts 相同）─────────────────────────
// 注：两个文件都实例化了同一个模型。
// 如果将来觉得重复，可以新建 src/models.ts 统一导出。
const ark = createOpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.ARK_API_KEY,
  compatibility: "compatible",
} as any);

const guideTextModel = ark.chat("ep-20260330041247-vw7wd");

// ── 常量 ──────────────────────────────────────────────
const MAX_CONTEXT_CHARS = 2000;

// ── 类型 ──────────────────────────────────────────────
export type SpotIntroParams = {
  spotName: string;
  historical_period?: string;
  themes?: string[];
  length?: number;  // 默认 500
  style?: string;   // 默认 "生动又不失专业性"
  other?: string;
};

// ── 辅助：把 chunk 数组格式化成带标签的 context 文本 ───
const ANGLE_LABELS: Record<string, string> = {
  general:      "概述",
  history:      "历史",
  architecture: "建筑",
  culture:      "文化",
  anecdote:     "趣闻",
  other:        "其他",
};

function buildRagContext(chunks: LandmarkChunk[]): string {
  let context = "";

  for (const chunk of chunks) {
    const label = ANGLE_LABELS[chunk.content_angle] ?? chunk.content_angle;
    const line = `[${label}] ${chunk.text}\n`;

    if (context.length + line.length > MAX_CONTEXT_CHARS) {
      // 还有剩余空间就截断填满，否则直接停
      const remaining = MAX_CONTEXT_CHARS - context.length;
      if (remaining > 80) {
        context += `[${label}] ${chunk.text.slice(0, remaining - label.length - 4)}\n`;
      }
      break;
    }
    context += line;
  }

  return context.trim();
}

// ── 主函数 ─────────────────────────────────────────────
export async function generateSpotIntro(
  params: SpotIntroParams
): Promise<string> {
  const {
    spotName,
    historical_period,
    themes,
    length = 500,
    style = "生动又不失专业性",
    other = "",
  } = params;

  // 第一步：从 Qdrant 检索相关 chunks
  const chunks = await searchChunksBySpotName(
    spotName,
    { historical_period, themes },
    6
  );

  const ragContext = buildRagContext(chunks);

  console.log(
    `[RAG] "${spotName}" 检索 ${chunks.length} 个 chunk，` +
    `context ${ragContext.length} 字符`
  );

  // 第二步：组装 prompt
  const contextSection = ragContext
    ? `\n以下是来自知识库的参考资料，请重点参考：\n${ragContext}`
    : "\n（知识库中暂无该景点资料，请凭你的知识介绍。）";

  const otherLine = other ? `\n5. 其他要求：${other}` : "";

  const prompt =
    `请为游客详细介绍"${spotName}"这个景点。\n` +
    `要求：\n` +
    `1. 模仿导游讲话的形式，语言生动自然。\n` +
    `2. 语言风格：${style}。\n` +
    `3. 字数：${length}字左右。\n` +
    `4. 输出纯文本，不要Markdown格式，不要使用括号。` +
    otherLine +
    contextSection;

  // 第三步：生成
  const { text: intro } = await generateText({
    model: guideTextModel,
    prompt,
  });

  return intro;
}
