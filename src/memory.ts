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