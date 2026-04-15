// src/memory.ts
import type { UIMessage } from "ai";
import { generateText, type LanguageModel } from "ai";
import { generateId } from "ai";

/** 把单条 part 压缩成一行文本；无用类型返回 null */
function partToText(part: any): string | null {
  if (part.type === "text") {
    return part.text?.trim() || null;
  }
  if (part.type?.startsWith("tool-")) {
    const toolName = part.type.replace(/^tool-/, "");
    // 只保留关键信息：input 参数 + output 的 message/spots 等摘要字段
    const inputStr = JSON.stringify(part.input ?? {});
    const out = part.output ?? {};
    // 尽量只取文字摘要字段，避免 polyline / intro 全文塞进来
    const outBrief = {
      message: out.message,
      spots: Array.isArray(out.spots)
        ? out.spots.map((s: any) => (typeof s === "string" ? s : s.name ?? s.name_en))
        : undefined,
      requestId: out.requestId,
      routeId: out.routeId
    };
    return `[调用工具 ${toolName}] 入参=${inputStr} 出参摘要=${JSON.stringify(outBrief)}`;
  }
  // step-start / data-xxx 一律丢弃
  return null;
}

/** 把一条 UIMessage 转成一段可读文本 */
export function messageToText(msg: UIMessage): string | null {
  if (!msg.parts || msg.parts.length === 0) return null;
  const lines = msg.parts.map(partToText).filter(Boolean);
  if (lines.length === 0) return null;
  return `【${msg.role}】\n${lines.join("\n")}`;
}

/** 批量把消息序列压成文本（用于喂给摘要 LLM） */
export function messagesToPlainText(msgs: UIMessage[]): string {
  return msgs.map(messageToText).filter(Boolean).join("\n\n---\n\n");
}


// ============= Step 2: 派生 & 判定 =============

/** 摘要缓存的持久化结构 */
export interface SummaryCache {
  /** 摘要文字 */
  summaryText: string;
  /** 摘要覆盖了原 messages 的前 N 条（即 messages[0..N-1] 被压缩） */
  summarizedUpToIndex: number;
}

/** 触发压缩的阈值：派生出的 compacted 视图长度 > THRESHOLD 就压 */
export const THRESHOLD = 20;

/** 压缩后保留最近 N 条原始消息 */
export const KEEP_RECENT = 5;

/**
 * 根据当前 messages 和已有摘要缓存，派生出本轮喂给 LLM 的消息序列
 *
 * - 无 cache：返回原消息
 * - 有 cache：[摘要消息] + messages.slice(summarizedUpToIndex)
 *
 * 注意：此函数是纯函数，不修改入参
 */
export function buildCompactedMessages(
  messages: UIMessage[],
  cache: SummaryCache | null
): UIMessage[] {
  if (!cache || cache.summarizedUpToIndex <= 0) {
    return messages;
  }

  // 防御：如果 index 越界（比如历史被意外清空），退化为原消息
  if (cache.summarizedUpToIndex > messages.length) {
    return messages;
  }

  const summaryMsg: UIMessage = {
    id: generateId(),
    role: "user",
    parts: [
      {
        type: "text",
        text: `【以下是之前对话的摘要，请在后续回答中参考】\n${cache.summaryText}`
      }
    ]
  } as UIMessage;

  return [summaryMsg, ...messages.slice(cache.summarizedUpToIndex)];
}

/**
 * 判断是否需要触发压缩
 * 注意：传入的是"派生后的 compacted 长度"，不是原 messages.length
 */
export function shouldCompact(compactedLength: number): boolean {
  return compactedLength > THRESHOLD;
}



// ============= Step 3: 增量摘要 =============

/**
 * 增量摘要：把"旧摘要 + 新增段落"压成"新摘要"
 *
 * 调用约定：调用方已经判断过 shouldCompact() === true
 *
 * @param model       用于摘要的 LLM（通常传 server.ts 里的 arkmodel）
 * @param messages    当前完整的 this.messages
 * @param oldCache    上一次的摘要缓存，null 表示首次压缩
 * @returns 新的 SummaryCache
 */
export async function performCompaction(
  model: LanguageModel,
  messages: UIMessage[],
  oldCache: SummaryCache | null
): Promise<SummaryCache> {
  const newUpTo = messages.length - KEEP_RECENT;
  const oldUpTo = oldCache?.summarizedUpToIndex ?? 0;

  // 安全检查：不应该发生，但防御
  if (newUpTo <= oldUpTo) {
    throw new Error(
      `performCompaction: newUpTo (${newUpTo}) <= oldUpTo (${oldUpTo})，` +
      `不需要压缩却被调用了`
    );
  }

  // 拼摘要原料
  const newSegmentText = messagesToPlainText(messages.slice(oldUpTo, newUpTo));

  const materials = oldCache
    ? `【之前的摘要】\n${oldCache.summaryText}\n\n【新增对话段落】\n${newSegmentText}`
    : `【对话内容】\n${newSegmentText}`;

  const prompt = `你是一个对话压缩助手。以下是用户与伦敦导游 AI 之间的对话历史（可能含有之前的压缩摘要）。请将其压缩为一段中文摘要，不超过 400 字。

【必须保留的信息】
1. 用户的核心意图和已明确表达的偏好：起点/终点、历史时期、主题、途经点数量、讲解词风格等
2. 已调用过的工具及关键产出：
   - 路线规划：必须保留 routeId、起点、终点、途经地标的完整英文名列表
   - 讲解词生成：必须保留 requestId、涉及的地标英文名列表
   - 语音生成：必须保留对应的地标和音频信息
3. AI 对用户提出但尚未完成的事项或建议
4. 任何后续对话可能引用到的具体事实（日期、数字、ID 等）

【禁止】
- 不要编造不存在的信息
- 不需要保留已生成讲解词的详细内容，力求简洁
- 不要保留礼貌用语、寒暄、情绪性表达
- 不要保留已经被后续操作覆盖或废弃的信息
- 不要出现任何 markdown 格式（标题、列表符号等），输出纯文本

【输入】
${materials}

【输出】
直接输出摘要正文，不要任何前缀或解释。`;

  const { text } = await generateText({
    model,
    prompt
  });

  return {
    summaryText: text.trim(),
    summarizedUpToIndex: newUpTo
  };
}