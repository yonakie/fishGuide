// ============================================================================
// src/eval/types.ts
//
// Harness 所需的全部类型定义。
// 这个文件是契约——后续所有模块（dataset、runner、metrics、reporter）都
// 以这些类型为边界。改动此文件意味着改动所有下游。
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Dataset 相关
// ---------------------------------------------------------------------------

/** 测试用例的分类，决定了如何评分和如何分组报告 */
export type EvalCategory = "exact" | "fuzzy" | "history" | "route" | "edge";

/** 单条测试用例的"期望"字段。所有字段可选——不同类型用例关心的维度不同。 */
export interface EvalExpected {
  /** 期望出现在 top-K retrieved 里的景点名（按 name_en，模糊匹配） */
  retrievedSpots?: string[];

  /** 答案必须包含的关键词（中文按子串，英文按词边界） */
  answerContains?: string[];

  /** 答案不应包含的关键词（出现一个扣一个） */
  answerExcludes?: string[];

  /** 边界用例：系统是否应该拒答或明确说"查不到" */
  shouldRefuse?: boolean;
}

/** 一条完整的 golden 测试用例 */
export interface EvalCase {
  /** 用例唯一 ID，用于报告里定位（如 "big_ben_history"） */
  id: string;

  /** 用例类别 */
  category: EvalCategory;

  /** 用户输入的 query */
  query: string;

  /** 期望的结果 */
  expected: EvalExpected;

  /** 可选：这条为什么重要、有什么特殊点，留给未来的自己看 */
  notes?: string;
}

// ---------------------------------------------------------------------------
// 2. Runner 输出（runRagQuery 返回）
// ---------------------------------------------------------------------------

/** Qdrant 返回的单个 chunk（简化为 metrics 需要的字段） */
export interface RetrievedChunk {
  landmarkId: string;
  nameEn: string;
  nameZh: string;
  score: number;       // Qdrant 的相似度分数
  chunkText: string;   // 原始 chunk 文本
}

/** 各阶段耗时，单位毫秒 */
export interface LatencyMs {
  retrieval: number;   // embedding + Qdrant 搜索
  generation: number;  // LLM 生成导览词
  total: number;       // 端到端
}

/** runRagQuery 的完整返回值 */
export interface RagResult {
  /** Qdrant 返回的 chunks（按相关性排序） */
  retrieved: RetrievedChunk[];

  /** LLM 生成的最终导览词（给用户看的那段） */
  answer: string;

  /** 拼接后真正喂给 LLM 的 context（给 faithfulness judge 用） */
  contextUsed: string;

  /** 耗时 */
  latencyMs: LatencyMs;
}

// ---------------------------------------------------------------------------
// 3. Metrics 的中间结果
// ---------------------------------------------------------------------------

/** 检索类指标 */
export interface RetrievalScore {
  precisionAtK: number;  // 0-1
  recallAtK: number;     // 0-1
  mrr: number;           // 0-1
  k: number;             // 这次评估用的 K 值（通常 6）
}

/** 关键词包含检查 */
export interface ContainsScore {
  score: number;         // 0-1（命中数/总数）
  hits: string[];        // 命中的关键词
  missing: string[];     // 缺失的关键词
}

/** 关键词排除检查 */
export interface ExcludesScore {
  score: number;         // 0-1（1 = 完美没违规）
  violations: string[];  // 违规的词
}

/** LLM judge 单项分数 */
export interface JudgeScore {
  score: 1 | 2 | 3 | 4 | 5;
  reasoning: string;
  /** 仅 faithfulness 有此字段：列出无依据的陈述 */
  unsupportedClaims?: string[];
}

// ---------------------------------------------------------------------------
// 4. 单条用例的完整评分（所有 metrics 的汇总）
// ---------------------------------------------------------------------------

/**
 * 一条用例跑完后的完整结果。
 * 如果某条用例运行时挂了（Qdrant 超时、OpenAI 错误等），只填 caseId/error。
 */
export interface CaseScore {
  caseId: string;
  category: EvalCategory;
  query: string;

  /** 运行时挂了就填这里，其他字段留空 */
  error?: string;

  /** 以下字段仅 error 为空时有值 */
  ragResult?: RagResult;
  retrieval?: RetrievalScore;
  contains?: ContainsScore;
  excludes?: ExcludesScore;
  faithfulness?: JudgeScore;
  relevance?: JudgeScore;

  /** 为方便排序/过滤预计算的单条总分（简单加权平均，实现时再定义权重） */
  overallScore?: number;
}

// ---------------------------------------------------------------------------
// 5. 聚合报告
// ---------------------------------------------------------------------------

/** 按 category 分组的均分 */
export interface CategoryAggregate {
  category: EvalCategory;
  caseCount: number;
  avgPrecisionAtK: number;
  avgRecallAtK: number;
  avgMrr: number;
  avgContains: number;
  avgExcludes: number;
  avgFaithfulness: number;   // 1-5 区间
  avgRelevance: number;      // 1-5 区间
  errorCount: number;        // 这个 category 里有多少条跑挂了
}

/** 全局均分（所有用例汇总，不分 category） */
export interface OverallAggregate {
  caseCount: number;
  avgPrecisionAtK: number;
  avgRecallAtK: number;
  avgMrr: number;
  avgContains: number;
  avgExcludes: number;
  avgFaithfulness: number;
  avgRelevance: number;
  errorCount: number;
}

/** 运行元数据 */
export interface RunMetadata {
  timestamp: string;           // ISO 8601
  datasetVersion: string;      // 从 dataset/golden.ts 读的 DATASET_VERSION
  totalDurationMs: number;     // harness 从开始到结束的墙钟时间
  tokenUsage: {
    judgeInputTokens: number;  // Claude judge 消耗
    judgeOutputTokens: number;
    // 未来要加 embedding/generation token 也在这里扩展
  };
  concurrency: number;         // 本次用了多大并发度（方便回溯）
}

/** 一次完整运行的聚合报告（写进 R2 的 raw-{timestamp}.json 就是它） */
export interface AggregateReport {
  metadata: RunMetadata;

  /** 每条用例的明细 */
  cases: CaseScore[];

  /** 按类别汇总 */
  byCategory: CategoryAggregate[];

  /** 全局汇总 */
  overall: OverallAggregate;
}

// ---------------------------------------------------------------------------
// 6. Baseline（比报告更精简的持久化基准）
// ---------------------------------------------------------------------------

/**
 * Baseline 只存"对比时要用的"核心指标，不存每条用例明细。
 * 理由：baseline 是长期参照物，保持最小化，不容易被 schema 改动弄坏。
 */
export interface BaselineMetrics {
  /** 建立此 baseline 时的 dataset 版本（不一致就不能直接对比） */
  datasetVersion: string;

  /** 建立时间 */
  establishedAt: string;

  /** 核心指标（用于退化判定） */
  overall: {
    avgPrecisionAtK: number;
    avgMrr: number;
    avgFaithfulness: number;
    avgRelevance: number;
  };

  /** 按 category 的核心指标（用于细粒度对比） */
  byCategory: Array<{
    category: EvalCategory;
    avgPrecisionAtK: number;
    avgFaithfulness: number;
  }>;
}

// ---------------------------------------------------------------------------
// 7. 退化判定结果（harness → endpoint 的通信）
// ---------------------------------------------------------------------------

export interface RegressionVerdict {
  regressed: boolean;
  reasons: string[];   // 如 ["avgPrecisionAtK dropped from 0.72 to 0.65 (-9.7%)"]
  threshold: number;   // 本次判定用的阈值（如 0.05 = 5%）
}
