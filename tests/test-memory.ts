// tests/test-memory.ts
import {
  loadMemories,
  saveMemory,
  updateMemory,
  deleteMemory,
  MAX_MEMORIES,
  type MemoryEntry
} from "../src/memory";

// ============= Mock CacheStorage =============
/**
 * 满足 memory.ts 里 CacheStorage 接口的最简实现：Map 包一下。
 * 这就是我们上一轮讨论 "storage 到底是啥" 的活例子。
 */
function createMockStorage() {
  const map = new Map<string, unknown>();
  return {
    get: async <T = unknown>(key: string) => map.get(key) as T | undefined,
    put: async <T = unknown>(key: string, value: T) => {
      map.set(key, value);
    },
    delete: async (key: string) => map.delete(key)
  };
}

(async () => {
  // ============= loadMemories =============
  console.log("\n========== loadMemories ==========");

  // Case 1: 空存储 → []
  {
    const s = createMockStorage();
    const list = await loadMemories(s);
    console.assert(Array.isArray(list) && list.length === 0, "空存储应返回 []");
    console.log("✅ Case 1: 空存储返回 []");
  }

  // ============= saveMemory =============
  console.log("\n========== saveMemory ==========");

  // Case 2: 新增一条 —— 验证 id / 时间戳 / 持久化
  {
    const s = createMockStorage();
    const entry = await saveMemory(s, {
      type: "preference",
      content: "以后回答 800 字"
    });
    console.assert(typeof entry.id === "string" && entry.id.length > 0, "应生成 id");
    console.assert(entry.type === "preference", "type 正确");
    console.assert(entry.content === "以后回答 800 字", "content 一致");
    console.assert(entry.createdAt === entry.updatedAt, "新建时两个时间相同");
    const list = await loadMemories(s);
    console.assert(list.length === 1 && list[0].id === entry.id, "确实落盘");
    console.log("✅ Case 2: 新增一条");
  }

  // Case 3: 多次新增按顺序累加
  {
    const s = createMockStorage();
    await saveMemory(s, { type: "preference", content: "a" });
    await saveMemory(s, { type: "fact", content: "b" });
    const list = await loadMemories(s);
    console.assert(
      list.length === 2 && list[0].content === "a" && list[1].content === "b",
      "按插入顺序排列"
    );
    console.log("✅ Case 3: 多次新增累加");
  }

  // Case 4: 空白 content 抛错
  {
    const s = createMockStorage();
    let threw = false;
    try {
      await saveMemory(s, { type: "fact", content: "   " });
    } catch {
      threw = true;
    }
    console.assert(threw, "空白 content 应抛错");
    console.log("✅ Case 4: 空白 content 抛错");
  }

  // Case 5: content 前后空格被 trim
  {
    const s = createMockStorage();
    const entry = await saveMemory(s, { type: "fact", content: "  hello  " });
    console.assert(entry.content === "hello", "content 应被 trim");
    console.log("✅ Case 5: content 被 trim");
  }

  // Case 6: 达到上限抛错 + 不会多存进去
  {
    const s = createMockStorage();
    for (let i = 0; i < MAX_MEMORIES; i++) {
      await saveMemory(s, { type: "fact", content: `m${i}` });
    }
    let threw = false;
    try {
      await saveMemory(s, { type: "fact", content: "overflow" });
    } catch {
      threw = true;
    }
    console.assert(threw, `到达 ${MAX_MEMORIES} 上限应抛错`);
    const list = await loadMemories(s);
    console.assert(list.length === MAX_MEMORIES, "失败后长度不变");
    console.log(`✅ Case 6: 达到上限 ${MAX_MEMORIES} 抛错`);
  }

  // ============= updateMemory =============
  console.log("\n========== updateMemory ==========");

  // Case 7: 只更新 content，其他字段保留
  {
    const s = createMockStorage();
    const entry = await saveMemory(s, { type: "preference", content: "old" });
    await new Promise((r) => setTimeout(r, 5)); // 确保 updatedAt 能差出来
    const updated = await updateMemory(s, entry.id, { content: "new" });
    console.assert(updated.id === entry.id, "id 不变");
    console.assert(updated.content === "new", "content 已更新");
    console.assert(updated.type === "preference", "未传字段保留");
    console.assert(updated.createdAt === entry.createdAt, "createdAt 不变");
    console.assert(updated.updatedAt !== entry.updatedAt, "updatedAt 刷新");
    console.log("✅ Case 7: 只更新 content");
  }

  // Case 8: 只更新 type
  {
    const s = createMockStorage();
    const entry = await saveMemory(s, { type: "preference", content: "x" });
    const updated = await updateMemory(s, entry.id, { type: "fact" });
    console.assert(updated.type === "fact", "type 已改");
    console.assert(updated.content === "x", "content 未动");
    console.log("✅ Case 8: 只更新 type");
  }

  // Case 9: 找不到 id 抛错
  {
    const s = createMockStorage();
    let threw = false;
    try {
      await updateMemory(s, "no-such-id", { content: "x" });
    } catch {
      threw = true;
    }
    console.assert(threw, "找不到 id 应抛错");
    console.log("✅ Case 9: 找不到 id 抛错");
  }

  // Case 10: 把 content 改成空白 → 抛错，且原数据不被污染
  {
    const s = createMockStorage();
    const entry = await saveMemory(s, { type: "fact", content: "x" });
    let threw = false;
    try {
      await updateMemory(s, entry.id, { content: "   " });
    } catch {
      threw = true;
    }
    console.assert(threw, "空白 content 应抛错");
    const list = await loadMemories(s);
    console.assert(list[0].content === "x", "失败后原值保留");
    console.log("✅ Case 10: 空白 patch 抛错且不污染");
  }

  // ============= deleteMemory =============
  console.log("\n========== deleteMemory ==========");

  // Case 11: 删除存在的条目
  {
    const s = createMockStorage();
    const a = await saveMemory(s, { type: "fact", content: "a" });
    const b = await saveMemory(s, { type: "fact", content: "b" });
    const ok = await deleteMemory(s, a.id);
    console.assert(ok === true, "应返回 true");
    const list = await loadMemories(s);
    console.assert(list.length === 1 && list[0].id === b.id, "只剩 b");
    console.log("✅ Case 11: 删除存在的条目");
  }

  // Case 12: 删除不存在的 id 返回 false
  {
    const s = createMockStorage();
    const ok = await deleteMemory(s, "no-such-id");
    console.assert(ok === false, "应返回 false");
    console.log("✅ Case 12: 删除不存在的 id 返回 false");
  }

  // ============= 集成：save → update → delete =============
  console.log("\n========== 集成流程 ==========");
  {
    const s = createMockStorage();
    const a = await saveMemory(s, {
      type: "preference",
      content: "回答 800 字"
    });
    const b = await saveMemory(s, { type: "fact", content: "我叫 Yusu" });
    await updateMemory(s, a.id, { content: "回答 500 字" });
    await deleteMemory(s, b.id);
    const list = await loadMemories(s);
    console.assert(list.length === 1, "应只剩 1 条");
    console.assert(list[0].content === "回答 500 字", "内容是更新后的");
    console.log("✅ 集成流程通过");
  }

  console.log("\n========== 全部通过 ==========");
})();