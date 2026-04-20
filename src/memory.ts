// src/memory.ts
// 长期记忆：跨对话持久化的用户偏好与声明性事实


// 第一步：定义相关数据格式
/** 记忆条目的分类 */
export type MemoryType =
  | "preference"  // 行为偏好：以后回答 800 字、用英文回答、语气正式
  | "fact";       // 用户声明的事实：我叫 Yusu、我的起点是 King's Cross

/** 一条长期记忆 */
export interface MemoryEntry {
  /** 唯一 ID，用 ai 包的 generateId() 生成 */
  id: string;

  /** 分类，决定 system prompt 里怎么组织 */
  type: MemoryType;

  /** 记忆正文。建议存"第一人称陈述句"，方便直接拼进 system prompt
   *  好：用户希望所有回答不超过 800 字
   *  差：以后都 800 字好吗？（保留了疑问语气） */
  content: string;

  /** 创建时间，ISO 字符串（可读性 > 紧凑性） */
  createdAt: string;

  /** 最近一次更新时间，ISO 字符串；新建时 = createdAt */
  updatedAt: string;
}

/** 持久化 key，固定不变 */
export const MEMORY_STORAGE_KEY = "longTermMemory";

/** 条目数上限。超过时 saveMemory 会报错，交由上层决定怎么处理 */
export const MAX_MEMORIES = 50;



// 第二步：定义读取、save、更新、删除对应id的memory的四个函数
import { generateId } from "ai";

/**
 * 最小存储接口。和 compaction.ts 里那份保持一致的设计哲学：
 * 不从 agents/ai-chat-agent import 类型，只约束"有 ctx.storage 三件套"。
 * 好处：测试可传 mock；未来换 Agent 基类不受影响。
 */
interface CacheStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

/** 读取全部长期记忆。从未写入过 → 返回 [] */
export async function loadMemories(
  storage: CacheStorage
): Promise<MemoryEntry[]> {
  const list = await storage.get<MemoryEntry[]>(MEMORY_STORAGE_KEY);
  return list ?? [];
}

/**
 * 新增一条记忆。
 * - 调用方只给 { type, content }，id / 时间戳由函数生成
 * - 超过 MAX_MEMORIES 抛错（交给上层处理，比如让 LLM 告诉用户先删旧的）
 * - 返回新建的完整 entry，方便上层打日志 / 回显
 */
export async function saveMemory(
  storage: CacheStorage,
  input: { type: MemoryType; content: string }
): Promise<MemoryEntry> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("saveMemory: content 不能为空");
  }

  const list = await loadMemories(storage);
  if (list.length >= MAX_MEMORIES) {
    throw new Error(
      `saveMemory: 已达上限 ${MAX_MEMORIES} 条，请先删除旧记忆`
    );
  }

  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: generateId(),
    type: input.type,
    content,
    createdAt: now,
    updatedAt: now
  };

  await storage.put(MEMORY_STORAGE_KEY, [...list, entry]);
  return entry;
}

/**
 * 更新指定 id 的记忆（只允许改 type / content）。
 * - 找不到 id 抛错
 * - id / createdAt 强制保留原值，防止 patch 污染
 * - updatedAt 自动刷新
 */
export async function updateMemory(
  storage: CacheStorage,
  id: string,
  patch: Partial<Pick<MemoryEntry, "type" | "content">>
): Promise<MemoryEntry> {
  const list = await loadMemories(storage);
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) {
    throw new Error(`updateMemory: 找不到 id=${id} 的记忆`);
  }

  const prev = list[idx];
  const nextContent =
    patch.content !== undefined ? patch.content.trim() : prev.content;
  if (!nextContent) {
    throw new Error("updateMemory: content 不能被改成空");
  }

  const updated: MemoryEntry = {
    id: prev.id,
    type: patch.type ?? prev.type,
    content: nextContent,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString()
  };

  const newList = [...list];
  newList[idx] = updated;
  await storage.put(MEMORY_STORAGE_KEY, newList);
  return updated;
}

/**
 * 删除指定 id 的记忆。
 * - 返回 true：找到并删掉
 * - 返回 false：本来就没有（不抛错，让上层决定要不要告诉用户）
 */
export async function deleteMemory(
  storage: CacheStorage,
  id: string
): Promise<boolean> {
  const list = await loadMemories(storage);
  const newList = list.filter((m) => m.id !== id);
  if (newList.length === list.length) {
    return false;
  }
  await storage.put(MEMORY_STORAGE_KEY, newList);
  return true;
}



/**
 * 把记忆列表格式化成一段可以直接拼进 system prompt 的文本。
 * 空数组 → 返回空串（让上层直接模板插值，不出现"空标题"）
 *
 * id 一起带上是为了让 LLM 在删除/修改时直接引用，无需再调 listUserMemories。
 * system prompt 里已经约束了"不要把 id 暴露给用户"。
 */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => `- [id=${m.id}] ${m.content}`);
  return `## 已保存的用户长期记忆
下面是你在之前对话中已经记录的用户偏好和事实。请在回答时自然地应用它们（比如控制回答长度、称呼用户），但不要把 id 字段或"我记得你说过..."之类的元话术主动提起。

${lines.join("\n")}

`;
}