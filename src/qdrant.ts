// 这个文件用来客户端初始化+embedding函数
import { QdrantClient } from "@qdrant/js-client-rest"; // 没加 type，导入的是“值+类型”，可以用来实例化。
import OpenAI from "openai";
import { config } from "dotenv";
config({ path: "../.dev.vars" }); // 环境变量文件不是.env了，特别设置一下

// 声明一些常量
export const COLLECTION = "london_landmarks";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

// 单例客户端
let _qdrant: QdrantClient | null = null; // 声明一个变量 _qdrant。变量类型是 QdrantClient 或 null（联合类型）。初始值为 null
let _openai: OpenAI | null = null;


// 声明一个函数，如果_qdrant是null的话，就去环境变量里拿到url（或者fallback直接拿），然后调用QdrantClient函数根据这个url创建一个qdrant客户端实例并且赋值给_qdrant
export function getQdrantClient(): QdrantClient {
  if (!_qdrant) {
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const apiKey = process.env.QDRANT_API_KEY;
    _qdrant = new QdrantClient({ url, ...(apiKey ? { apiKey } : {}) });
  }
  return _qdrant;
}

// 同理，声明一个函数，传入key创建openai客户端实例，赋值给_openai
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_EMBEDDING_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_EMBEDDING_API_KEY is not set");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}


// 接下来是embedding函数：
export async function embedText(text: string): Promise<number[]> {
    const openai = getOpenAIClient();
    // 这边embeddings是openai的api的一个方法，除此之外openai还有很多api方法，可以在https://developers.openai.com/api/reference/resources/embeddings/methods/create 的侧边栏看到，还可以在网页中看到每个方法的返回值res长啥样，比如以下的embeddings.create返回的就是一个对象，长这样：
    /*
      {
        "object": "list",
        "data": [
            {
            "object": "embedding",
            "embedding": [
                0.0023064255,
                -0.009327292,
                .... (1536 floats total for ada-002)
                -0.0028842222,
            ],
            "index": 0
            }
        ],
        "model": "text-embedding-ada-002",
        "usage": {
            "prompt_tokens": 8,
            "total_tokens": 8
        }
        }  
    */
    const res = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        // 如果这里input: string[]，也即传入了一个数组，那么res里的data数组就包含多个obj
    });
    const vector = res.data[0].embedding;

    // 安全校验：确保维度与入库时一致
    if (vector.length !== EMBEDDING_DIM) {
        throw new Error(
            `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${vector.length}`
        );
    }
    return vector
}









// 第二部分：按照spotName搜索地标的chunks们，并且将格式标准化后返回。检索分2步，第一步严格检索，第二步是fallback，如果第一步返回结果不好就把spotName向量化后检索。
// ── 类型定义 ───────────────────────────────────────────
// 一共9个字段，其中score是可选的
export type LandmarkChunk = {
  id: string | number;
  text: string;
  name_en: string;
  name_zh: string;
  landmark_id: string;
  content_angle: string;
  historical_period: string;
  themes: string[];
  score?: number; // 只有向量检索的结果才有 score
};

export type SearchFilters = {
  historical_period?: string;
  themes?: string[];
};

// ── 辅助：把 Qdrant 返回的 payload（unknown 类型）转成强类型 ──
// 注意，这个类型在查询阶段用不到，主要是把返回的point拍成这个形状，然后return出去用。
function parsePayload(
  payload: Record<string, unknown> | null | undefined
): Omit<LandmarkChunk, "id" | "score"> {
  return {
    text: String(payload?.text ?? ""), // ??代表只有它左边是 null 或 undefined 时，才会使用右边的 ""
    name_en: String(payload?.name_en ?? ""),
    name_zh: String(payload?.name_zh ?? ""),
    landmark_id: String(payload?.landmark_id ?? ""),
    content_angle: String(payload?.content_angle ?? ""),
    historical_period: String(payload?.historical_period ?? ""),
    themes: Array.isArray(payload?.themes) ? (payload.themes as string[]) : [],
  };
}

// ── 主检索函数 ─────────────────────────────────────────
// 接受地点名称、过滤条件（默认为空obj）、chunk个数（默认6个），返回一个promise对象，这个promise对象的返回值是个数组[]，里面的每个元素都是一个符合type LandmarkChunk的obj
export async function searchChunksBySpotName(
  spotName: string,
  filters: SearchFilters = {},
  limit = 6
): Promise<LandmarkChunk[]> {
  const qdrant = getQdrantClient();
  const { historical_period, themes } = filters;

  // period 和 themes 两步都用得到，先构建好
  // 写省略号是为了把里面俩玩意的[]给拆了，把里面内容拼一块儿，最后得到的是扁平结构：可能是 []，可能是 [period条件]，可能是 [themes条件]，可能是 [period条件, themes条件]。如果不写 ...，会变成嵌套数组，比如：[ [period条件], [] ]
  const commonConditions = [
    ...(historical_period
      ? [{ key: "historical_period", match: { value: historical_period } }]
      : []),
    ...(themes?.length ? [{ key: "themes", match: { any: themes } }] : []),
  ];

  // ── 第一步：精确名称匹配，不用向量 ───────────────────
  const exactFilter = {
    must: [
      // must 里的每一项都要满足，should至少满足一个
      // name_en 或 name_zh 与 spotName 完全相等（任一匹配即可）
      {
        should: [
          { key: "name_en", match: { value: spotName } },
          { key: "name_zh", match: { value: spotName } },
        ],
      },
      // 追加 period 和 themes 的过滤条件
      ...commonConditions,
    ],
  };

  // 注意！payload查询，用的是scroll这个方法！而下面的向量查询用的是query方法
  const scrollResult = await qdrant.scroll(COLLECTION, {
    filter: exactFilter as any, // SDK 类型定义比较严格，此处 as any 是安全的
    limit: 8,
    with_payload: true,
    with_vector: false,
  });

  // 处理一下拿到的points，把每个的payload都展开
  const exactChunks: LandmarkChunk[] = scrollResult.points.map((p) => ({
    id: p.id,
    ...parsePayload(p.payload as Record<string, unknown>),
  }));

  // 精确匹配结果够用，直接返回
  if (exactChunks.length >= 3) {
    console.log(
      `[Qdrant] "${spotName}" 精确匹配 ${exactChunks.length} 条，直接使用`
    );
    return exactChunks.slice(0, limit);
  }

  // ── 第二步：精确匹配不足，触发语义向量 fallback ──────
  console.log(
    `[Qdrant] "${spotName}" 精确匹配仅 ${exactChunks.length} 条，触发语义 fallback`
  );

  // 调用embed函数，拿到向量化的spotName
  const vector = await embedText(spotName);

  // fallback 阶段不再过滤名称，只保留 period/themes 条件
  const fallbackFilter =
    commonConditions.length > 0 ? { must: commonConditions } : undefined;

  // 注意！向量查询的方法是.query
  const queryResult = await qdrant.query(COLLECTION, {
    query: vector,
    filter: fallbackFilter as any,
    limit,
    with_payload: true,
  });

  const vectorChunks: LandmarkChunk[] = queryResult.points.map((p) => ({
    id: p.id,
    ...parsePayload(p.payload as Record<string, unknown>),
    score: p.score,
  }));

  // ── 合并去重：精确匹配的结果排在前面 ─────────────────
  const seen = new Set<string | number>();
  const merged: LandmarkChunk[] = [];

  // 去重方法：新建一个set，遍历所有points，把id放进去，只有新增id才append这个point到最终的[]里
  for (const chunk of [...exactChunks, ...vectorChunks]) {
    if (!seen.has(chunk.id)) {
      seen.add(chunk.id);
      merged.push(chunk);
    }
  }

  return merged.slice(0, limit);
}





// 第三部分：给routePlan工具写的位置查询函数
// ── 类型定义（routePlan 用）────────────────────────────
// 左上和右下的经纬度
export type BoundingBox = {
  top_left: { lat: number; lon: number };
  bottom_right: { lat: number; lon: number };
};

// 支持三个过滤选项
export type RouteSearchFilters = {
  historical_period?: string;
  themes?: string[];
  indoor_outdoor?: string;
};

export type RouteCandidate = {
  landmark_id: string;
  name_en: string;
  name_zh: string;
  lat: number;
  lon: number;
  rating: number;
  user_rating_count: number;
  themes: string[];
  primary_type: string;
  highlight_en: string;
  highlight_zh: string;
  indoor_outdoor: string;
  visit_duration_min: number;
  neighborhood: string;
};

// ── 辅助：payload → RouteCandidate ────────────────────
// 这里和上面的parsepayload选的字段不太一样，你看这里没选text，因为这个只用来路径规划，更关心名字和经纬度，不需要text这个又臭又长的东西。这边写类型方便我们刈除不需要的东西。
function parseRoutePayload(
  payload: Record<string, unknown> | null | undefined
): RouteCandidate {
  const geo = payload?.geo_point as { lat?: number; lon?: number } | undefined;
  return {
    landmark_id:      String(payload?.landmark_id      ?? ""),
    name_en:          String(payload?.name_en           ?? ""),
    name_zh:          String(payload?.name_zh           ?? ""),
    lat:              geo?.lat                          ?? 0,
    lon:              geo?.lon                          ?? 0,
    rating:           Number(payload?.rating            ?? 0),
    user_rating_count:Number(payload?.user_rating_count ?? 0),
    themes:           Array.isArray(payload?.themes)
                        ? (payload.themes as string[])
                        : [],
    primary_type:     String(payload?.primary_type      ?? ""),
    highlight_en:     String(payload?.highlight_en      ?? ""),
    highlight_zh:     String(payload?.highlight_zh      ?? ""),
    indoor_outdoor:   String(payload?.indoor_outdoor    ?? ""),
    visit_duration_min:Number(payload?.visit_duration_min ?? 0),
    neighborhood:     String(payload?.neighborhood      ?? ""),
  };
}

// ── 地理范围检索 ───────────────────────────────────────
// 这个目前只负责：接受特定风格、起讫点的经纬度，然后画一个正方形选出这范围内的所有point，然后按照payload里的landmark_id去重，注意不是point的id，后者包含了chunk的index，是每个point独一无二的没法用来去重。
export async function searchByBoundingBox(
  bbox: BoundingBox,
  filters: RouteSearchFilters = {},
  rawLimit = 300  // 故意设大，因为后面要按 landmark_id 去重
): Promise<RouteCandidate[]> {
  const qdrant = getQdrantClient();
  const { historical_period, themes, indoor_outdoor } = filters;

  // 组装所有 must 条件
  const conditions: object[] = [
    // 地理范围是核心条件
    // qdrant支持接受两个经纬度的obj作为一个bounding box来找之内的point
    {
      key: "geo_point",
      geo_bounding_box: {
        top_left:     bbox.top_left,
        bottom_right: bbox.bottom_right,
      },
    },
    ...(historical_period
      ? [{ key: "historical_period", match: { value: historical_period } }]
      : []),
    ...(themes?.length
      ? [{ key: "themes", match: { any: themes } }]
      : []),
    ...(indoor_outdoor
      ? [{ key: "indoor_outdoor", match: { value: indoor_outdoor } }]
      : []),
  ];

  const scrollResult = await qdrant.scroll(COLLECTION, {
    filter: { must: conditions } as any,
    limit: rawLimit,
    with_payload: true,
    with_vector: false,
  });

  console.log(
    `[Qdrant] bounding box 原始命中 ${scrollResult.points.length} 个 chunk`
  );

  // 按 landmark_id 去重：同一地标有多个 chunk，只保留 rating 最高的那条
  const byId = new Map<string, RouteCandidate>();

  for (const point of scrollResult.points) {
    const candidate = parseRoutePayload(
      point.payload as Record<string, unknown>
    );
    if (!candidate.landmark_id) continue;

    const existing = byId.get(candidate.landmark_id);
    if (!existing || candidate.rating > existing.rating) {
      byId.set(candidate.landmark_id, candidate);
    }
  }

  const results = Array.from(byId.values());
  console.log(`[Qdrant] 去重后得到 ${results.length} 个独立地标`);

  return results;
}
