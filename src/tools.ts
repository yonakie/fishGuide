/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { generateText, type UIMessageStreamWriter } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
// import { scheduleSchema } from "agents/schedule";
import { GUIDE_DATA_PART, type GuideEvent } from "./shared";
import { getWikiSummary, hashText, synthesizeTtsWithFallback } from "./tts";
import { generateSpotIntro } from "./rag";


import {
  geocode,
  computeBoundingBox,
  perpendicularDistanceToSegment,
  getOptimizedRoute,
} from "./geo";
import { searchByBoundingBox } from "./qdrant";
import {
  ROUTE_DATA_PART,
  type RouteEvent,
  type RouteData,
} from "./shared";


const ark = createOpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: "compatible"
} as any);

const guideTextModel = ark.chat("ep-20260330041247-vw7wd");

const streamGuideEvent = (
  writer: UIMessageStreamWriter | undefined,
  event: GuideEvent
) => {
  if (!writer) return;
  writer.write({
    type: `data-${GUIDE_DATA_PART}`,
    data: event
  });
};

const streamRouteEvent = (
  writer: UIMessageStreamWriter | undefined,
  event: RouteEvent
) => {
  if (!writer) return;
  writer.write({
    type: `data-${ROUTE_DATA_PART}`,
    data: event,
  });
};


const ensureAudioAssetsTable = (agent: Chat) => {
  agent.sql`
    CREATE TABLE IF NOT EXISTS audio_assets (
      id TEXT PRIMARY KEY,
      text_hash TEXT NOT NULL,
      object_key TEXT NOT NULL,
      voice TEXT NOT NULL,
      created_at TEXT NOT NULL,
      spot_name TEXT NOT NULL,
      UNIQUE(text_hash, voice)
    )
  `;
};

const ensureGuideIntrosTable = (agent: Chat) => {
  agent.sql`
    CREATE TABLE IF NOT EXISTS guide_intros (
      request_id TEXT NOT NULL,
      spot_name  TEXT NOT NULL,
      intro      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (request_id, spot_name)
    )
  `;
};


const getOrCreateAudioAsset = async (
  agent: Chat,
  bucket: R2Bucket,
  intro: string,
  spot: string
) => {
  ensureAudioAssetsTable(agent);

  const textHash = await hashText(intro);
  const voice = "google-tts-zh-CN-v1";
  const objectKey = `guide-audio/${textHash}.mp3`;
  const spotName = spot;

  const existing = agent.sql<{ id: string; object_key: string }>`
    SELECT id, object_key FROM audio_assets
    WHERE text_hash = ${textHash} AND voice = ${voice}
    LIMIT 1
  `;

  if (existing.length > 0) {
    return {
      audioAssetId: existing[0].id,
      audioUrl: `/audio/${encodeURIComponent(existing[0].object_key)}`
    };
  }

  const audioBytes = await synthesizeTtsWithFallback(intro);

  await bucket.put(objectKey, audioBytes, {
    httpMetadata: {
      contentType: "audio/mpeg"
    },
    customMetadata: {
      textHash,
      voice,
      spotName
    }
  });

  const audioAssetId = crypto.randomUUID();
  agent.sql`
    INSERT INTO audio_assets (id, text_hash, object_key, voice, created_at, spot_name)
    VALUES (${audioAssetId}, ${textHash}, ${objectKey}, ${voice}, ${new Date().toISOString()}, ${spotName})
  `;

  return {
    audioAssetId,
    audioUrl: `/audio/${encodeURIComponent(objectKey)}`
  };
};

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 */
// const getWeatherInformation = tool({
//   description: "show the weather in a given city to the user",
//   inputSchema: z.object({ city: z.string() })
//   // Omitting execute function makes this tool require human confirmation
// });

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
// const getLocalTime = tool({
//   description: "get the local time for a specified location",
//   inputSchema: z.object({ location: z.string() }),
//   execute: async ({ location }) => {
//     console.log(`Getting local time for ${location}`);
//     return "10am";
//   }
// });

// const scheduleTask = tool({
//   description: "A tool to schedule a task to be executed at a later time",
//   inputSchema: scheduleSchema,
//   execute: async ({ when, description }) => {
//     // we can now read the agent context from the ALS store
//     const { agent } = getCurrentAgent<Chat>();

//     function throwError(msg: string): string {
//       throw new Error(msg);
//     }
//     if (when.type === "no-schedule") {
//       return "Not a valid schedule input";
//     }
//     const input =
//       when.type === "scheduled"
//         ? when.date // scheduled
//         : when.type === "delayed"
//           ? when.delayInSeconds // delayed
//           : when.type === "cron"
//             ? when.cron // cron
//             : throwError("not a valid schedule input");
//     try {
//       agent!.schedule(input!, "executeTask", description);
//     } catch (error) {
//       console.error("error scheduling task", error);
//       return `Error scheduling task: ${error}`;
//     }
//     return `Task scheduled for type "${when.type}" : ${input}`;
//   }
// });

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
// const getScheduledTasks = tool({
//   description: "List all tasks that have been scheduled",
//   inputSchema: z.object({}),
//   execute: async () => {
//     const { agent } = getCurrentAgent<Chat>();

//     try {
//       const tasks = agent!.getSchedules();
//       if (!tasks || tasks.length === 0) {
//         return "No scheduled tasks found.";
//       }
//       return tasks;
//     } catch (error) {
//       console.error("Error listing scheduled tasks", error);
//       return `Error listing scheduled tasks: ${error}`;
//     }
//   }
// });

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
// const cancelScheduledTask = tool({
//   description: "Cancel a scheduled task using its ID",
//   inputSchema: z.object({
//     taskId: z.string().describe("The ID of the task to cancel")
//   }),
//   execute: async ({ taskId }) => {
//     const { agent } = getCurrentAgent<Chat>();
//     try {
//       await agent!.cancelSchedule(taskId);
//       return `Task ${taskId} has been successfully canceled.`;
//     } catch (error) {
//       console.error("Error canceling scheduled task", error);
//       return `Error canceling task ${taskId}: ${error}`;
//     }
//   }
// });
const routePlan = tool({
  description:
    "根据用户指定的起点和终点，在沿途走廊内搜索符合条件的伦敦地标，" +
    "调用 Google Maps 优化途经点顺序，返回适合步行的路线规划。",
  inputSchema: z.object({
    start: z.string().describe("起点名称或地址，如 'Baker Street Station'"),
    end: z.string().describe("终点名称或地址，如 'London Eye'"),
    historical_period: z
      .string()
      .optional()
      .describe(
        "历史时期偏好，可选：medieval | tudor | stuart | georgian | victorian | edwardian | wwi_wwii | postwar | contemporary | ancient"
      ),
    themes: z
      .array(z.string())
      .optional()
      .describe(
        "主题偏好，可选：royalty | war | religion | science | literature | art | architecture | commerce | politics | nature | sport | mystery | social_history"
      ),
    indoor_outdoor: z
      .string()
      .optional()
      .describe("室内外偏好，可选：indoor | outdoor | both"),
    max_spots: z
      .number()
      .default(5)
      .describe("最多推荐的途经地标数量，默认 5 个"),
  }),
  execute: async (
    { start, end, historical_period, themes, indoor_outdoor, max_spots },
    options
  ) => {
    const writer = (
      options.experimental_context as
        | { writer?: UIMessageStreamWriter }
        | undefined
    )?.writer;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not set");

    const routeId = crypto.randomUUID();

    // ── 第一步：通知前端开始规划 ─────────────────────────
    streamRouteEvent(writer, { kind: "route_planning", routeId, start, end });

    // ── 第二步：地理编码起终点 ────────────────────────────
    const [startCoord, endCoord] = await Promise.all([
      geocode(start, apiKey),
      geocode(end, apiKey),
    ]);

    // ── 第三步：Qdrant 地理范围检索 ───────────────────────
    streamRouteEvent(writer, {
      kind: "route_searching",
      routeId,
      message: "正在搜索沿途地标…",
    });

    const bbox = computeBoundingBox(startCoord, endCoord, 500);
    const candidates = await searchByBoundingBox(bbox, {
      historical_period,
      themes,
      indoor_outdoor,
    });

    console.log(`[routePlan] bounding box 内共 ${candidates.length} 个地标`);

    // ── 第四步：走廊距离过滤 + 评分排序 ──────────────────
    const CORRIDOR_WIDTH_M = 400;

    const scored = candidates
      .map((c) => {
        const corridorDist = perpendicularDistanceToSegment(
          { lat: c.lat, lon: c.lon },
          startCoord,
          endCoord
        );
        return { ...c, _corridorDist: corridorDist };
      })
      .filter((c) => c._corridorDist <= CORRIDOR_WIDTH_M)
      .map((c) => {
        // rating 范围 1-5，0 表示无评分，给无评分地标中间分
        const ratingScore = c.rating > 0 ? (c.rating - 1) / 4 : 0.5;
        // 距离分：越靠近路线中轴线越高
        const distScore = 1 - c._corridorDist / CORRIDOR_WIDTH_M;
        return {
          ...c,
          _score: 0.7 * ratingScore + 0.3 * distScore,
        };
      })
      .sort((a, b) => b._score - a._score);

    const topSpots = scored.slice(0, max_spots);

    console.log(
      `[routePlan] 走廊内 ${scored.length} 个，选取 top ${topSpots.length} 个`
    );

    // ── 第五步：Google Directions API 优化途经点顺序 ──────
    const waypoints = topSpots.map((s) => ({ lat: s.lat, lon: s.lon }));
    const directions = await getOptimizedRoute(
      startCoord,
      endCoord,
      waypoints,
      apiKey
    );

    // waypointOrder 是 Google 返回的最优顺序索引，如 [2, 0, 1]
    // 用它重排 topSpots，让展示顺序与地图一致
    const orderedSpots =
      directions.waypointOrder.length > 0
        ? directions.waypointOrder.map((i) => topSpots[i])
        : topSpots;

    // ── 第六步：组装路线数据 + 通知前端完成 ───────────────
    const routeData: RouteData = {
      startName: start,        // ← 新增
      startLat:  startCoord.lat, // ← 新增
      startLon:  startCoord.lon, // ← 新增
      endName:   end,            // ← 新增
      endLat:    endCoord.lat,   // ← 新增
      endLon:    endCoord.lon,   // ← 新增
      spots: orderedSpots.map((s) => ({
        name_en:    s.name_en,
        name_zh:    s.name_zh,
        lat:        s.lat,
        lon:        s.lon,
        rating:     s.rating,
        themes:     s.themes,
        highlight_zh: s.highlight_zh,
        primary_type: s.primary_type,
      })),
      totalDistance: directions.totalDistance,
      totalDuration: directions.totalDuration,
      polyline:      directions.polyline,
    };

    streamRouteEvent(writer, { kind: "route_done", routeId, route: routeData });

    return {
      routeId,
      start: { name: start, ...startCoord },
      end:   { name: end,   ...endCoord   },
      // 把地标名传回给模型，方便模型在下一轮对话中提取给 generateGuideIntros
      spots: orderedSpots.map((s) => s.name_en),
      totalDistance: directions.totalDistance,
      totalDuration: directions.totalDuration,
      message:
        `已规划从「${start}」到「${end}」的步行路线，` +
        `途经 ${orderedSpots.length} 个地标，` +
        `全程约 ${directions.totalDistance}，步行约 ${directions.totalDuration}。` +
        `如需为路线地标生成语音导览，请告知。`,
    };
  },
});




const generateGuideIntros = tool({
  description:
    "为用户指定的一个或多个景点生成文字讲解词。" +
    "当用户想先查看讲解词内容再决定是否生成语音时使用此工具。" +
    "工具执行完毕后，讲解词会以卡片形式展示给用户，不含音频。",
  inputSchema: z.object({
    spots: z
      .array(
        z.object({
          name: z.string().describe("景点名称，尽量使用英文标准名称"),
          historical_period: z
            .string()
            .optional()
            .describe(
              "用户希望重点介绍的历史时期，可选值：medieval | tudor | stuart | georgian | victorian | edwardian | wwi_wwii | postwar | contemporary | ancient"
            ),
          themes: z
            .array(z.string())
            .optional()
            .describe(
              "用户希望重点介绍的主题，可选值：royalty | war | religion | science | literature | art | architecture | commerce | politics | nature | sport | mystery | social_history"
            ),
        })
      )
      .min(1)
      .describe("需要生成讲解词的景点列表"),
    requirements: z
      .object({
        length: z
          .number()
          .describe(
            "讲解词长度（字数）。用户说“简短”则500，“详细”或“长一点”则1000，未提及默认500"
          )
          .default(500),
        style: z
          .string()
          .describe(
            "讲解风格，如“幽默风趣”、“讲给小孩听”等。用户未提及默认“生动又不失专业性”"
          )
          .default("生动又不失专业性"),
        other: z
          .string()
          .describe("用户提到的其他定制化要求，没有则填空字符串")
          .default(""),
      })
      .describe("讲解词的生成要求"),
  }),
  execute: async ({ spots, requirements }, options) => {
    const { agent } = getCurrentAgent<Chat>();
    if (!agent) throw new Error("Agent context unavailable for generateGuideIntros");

    const writer = (
      options.experimental_context as
        | { writer?: UIMessageStreamWriter }
        | undefined
    )?.writer;

    // 去除空白，过滤空名称
    const normalizedSpots = spots
      .map((s) => ({ ...s, name: s.name.trim() }))
      .filter((s) => s.name.length > 0);

    const requestId = crypto.randomUUID();

    // 通知前端开始，让它渲染 pending 卡片
    streamGuideEvent(writer, {
      kind: "init",
      requestId,
      spots: normalizedSpots.map((s) => s.name),
    });

    // 确保 SQLite 表存在
    ensureGuideIntrosTable(agent);

    // 并行生成所有景点的讲解词
    const results = await Promise.all(
      normalizedSpots.map(async (spot) => {
        streamGuideEvent(writer, {
          kind: "processing",
          requestId,
          spotName: spot.name,
        });

        try {
          const intro = await generateSpotIntro({
            spotName:          spot.name,
            historical_period: spot.historical_period,
            themes:            spot.themes,
            length:            requirements.length,
            style:             requirements.style,
            other:             requirements.other,
          });

          // 持久化到 SQLite，方便 generateGuideAudio 后续读取
          // INSERT OR REPLACE：同一 requestId+spotName 重试时不报主键冲突
          agent.sql`
            INSERT OR REPLACE INTO guide_intros (request_id, spot_name, intro, created_at)
            VALUES (${requestId}, ${spot.name}, ${intro}, ${new Date().toISOString()})
          `;

          // 通知前端：卡片完成（有文字，无音频）
          streamGuideEvent(writer, {
            kind: "done",
            requestId,
            spotName: spot.name,
            intro,
            // audioUrl 故意不传，前端卡片此时只展示文字
          });

          return true;
        } catch (error) {
          console.error(`Intro generation failed for ${spot.name}`, error);
          streamGuideEvent(writer, {
            kind: "error",
            requestId,
            spotName: spot.name,
            message: "讲解词生成失败，请稍后重试。",
          });
          return false;
        }
      })
    );

    const allSucceeded = results.every(Boolean);
    const spotNames = normalizedSpots.map((s) => s.name).join("、");

    return {
      requestId,
      spots: normalizedSpots.map((s) => s.name),
      message: allSucceeded
        ? `已完成 ${spotNames} 的讲解词生成，用户可以查阅卡片内容。如果满意，可以调用 generateGuideAudio 为其生成语音。`
        : "部分景点讲解词生成出现问题，请重试。",
    };
  },
});


const generateGuideAudio = tool({
  description:
    "为已生成讲解词的景点合成语音。" +
    "必须先调用 generateGuideIntros 获取 requestId，再调用此工具。" +
    "执行完成后，前端卡片将从纯文字状态更新为可播放状态。",
  inputSchema: z.object({
    requestId: z
      .string()
      .describe("generateGuideIntros 返回的 requestId"),
    spots: z
      .array(z.string())
      .optional()
      .describe(
        "可选：只为这些景点生成语音。不填则为 requestId 对应的全部景点生成。"
      ),
  }),
  execute: async ({ requestId, spots }, options) => {
    const { agent } = getCurrentAgent<Chat>();
    if (!agent) throw new Error("Agent context unavailable for generateGuideAudio");

    const guideAudioBucket = (
      options.experimental_context as
        | { guideAudioBucket?: R2Bucket }
        | undefined
    )?.guideAudioBucket;

    if (!guideAudioBucket) {
      throw new Error("R2 bucket unavailable in tool context");
    }

    const writer = (
      options.experimental_context as
        | { writer?: UIMessageStreamWriter }
        | undefined
    )?.writer;

    // ── 从 SQLite 读取已生成的讲解词 ─────────────────────
    const rows = agent.sql<{ spot_name: string; intro: string }>`
      SELECT spot_name, intro
      FROM guide_intros
      WHERE request_id = ${requestId}
    `;

    if (rows.length === 0) {
      return {
        requestId,
        message:
          `未找到 requestId="${requestId}" 的讲解词记录，` +
          "请先调用 generateGuideIntros。",
      };
    }

    // 如果用户只想为部分景点生成语音，过滤
    const targetRows = spots?.length
      ? rows.filter((r) => spots.includes(r.spot_name))
      : rows;

    if (targetRows.length === 0) {
      return {
        requestId,
        message: "指定的景点名称与记录中不符，请检查后重试。",
      };
    }

    // ── 并行生成语音 ───────────────────────────────────────
    const results = await Promise.all(
      targetRows.map(async ({ spot_name, intro }) => {
        // 先把卡片状态拨回 processing，让用户知道"正在生成语音"
        streamGuideEvent(writer, {
          kind: "processing",
          requestId,
          spotName: spot_name,
        });

        try {
          const { audioAssetId, audioUrl } = await getOrCreateAudioAsset(
            agent,
            guideAudioBucket,
            intro,
            spot_name
          );

          console.log(
            `[TTS] ${spot_name} asset id=${audioAssetId} url=${audioUrl}`
          );

          // done 事件带上 intro + audioUrl，前端卡片变为可播放
          streamGuideEvent(writer, {
            kind: "done",
            requestId,
            spotName: spot_name,
            intro,
            audioUrl,
          });

          return true;
        } catch (error) {
          console.error(`Audio generation failed for ${spot_name}`, error);
          streamGuideEvent(writer, {
            kind: "error",
            requestId,
            spotName: spot_name,
            message: "语音生成失败，请稍后重试。",
          });
          return false;
        }
      })
    );

    const allSucceeded = results.every(Boolean);
    const spotNames = targetRows.map((r) => r.spot_name).join("、");

    return {
      requestId,
      spots: targetRows.map((r) => r.spot_name),
      message: allSucceeded
        ? `已完成 ${spotNames} 的语音生成，用户现在可以播放了。`
        : "部分景点语音生成出现问题，请重试。",
    };
  },
});




const planAudioGuide = tool({
  description:
    "当用户希望生成1个或者多个地点串联的语音解说时，提取地点列表并并行生成每个地点的讲解与音频。",
  inputSchema: z.object({
    spots: z
      .array(z.string())
      .min(1)
      .describe("用户希望解说的地点或展品名称列表"),
    requirements: z
      .object({
        length: z
          .number()
          .describe(
            "用户提到的讲解词生成长度偏好，比如如果用户说1000字左右，这里就写1000。如果用户没说具体多少字，就说长一点，则设为1500；如果用户说简短即可，则设为500；如果用户没说需要的长度，默认为800"
          ),
        style: z
          .string()
          .describe(
            "用户要求的生成风格，比如“幽默风趣”、“讲给小孩听”、“通俗易懂”等。如果用户没提到，就默认为“轻松活泼又不失严谨”"
          ),
        other: z
          .string()
          .describe("用户提到的除了length和style外的其它定制化要求")
      })
      .describe("用户对语音介绍的生成要求")
  }),
  execute: async ({ spots, requirements }, options) => {
    // 这里第二个参数options就是我server.ts里传的自定义上下文，不知道咋拿到的，反正就是可以在execute这里拿到！
    // 获得当前agent
    const { agent } = getCurrentAgent<Chat>();
    if (!agent) {
      throw new Error("Agent context unavailable for planAudioGuide");
    }

    // 从server.ts里传给streamText的参数里面的自由背包里，拿到我事先传过来的guideAudioBucket
    const guideAudioBucket = (
      options.experimental_context as
        | { guideAudioBucket?: R2Bucket }
        | undefined
    )?.guideAudioBucket;

    if (!guideAudioBucket) {
      throw new Error("R2 bucket unavailable in tool context");
    }

    // 整理一下spots，不写也行
    const normalizedSpots = Array.from(
      new Set(spots.map((spot) => spot.trim()).filter(Boolean))
    );

    // 从server.ts里传给streamText的参数里面的自由背包里，拿到我事先传过来的writer
    const writer = (
      options.experimental_context as
        | { writer?: UIMessageStreamWriter }
        | undefined
    )?.writer;

    // 生成一个随机id，主要是放part里的，方便react渲染卡片
    const requestId = crypto.randomUUID();

    // 动用writer工具，往stream大流里塞我自定义的streamGuideEvent开始了的信息part，这玩意其实不塞进去也行，主要是这样的话前端可以拿到这个init然后就知道开始干活了
    streamGuideEvent(writer, {
      kind: "init",
      requestId,
      spots: normalizedSpots
    });

    // promise.all意思是，里面写了一堆异步，全部开始，等你们全搞定了再返回，最终拿到的results是一个数组，里面放了每个spot的生成状态，比如results = [true, true, false]
    const results = await Promise.all(
      // map每个spot，对每个spot都做如下事情：
      // 1. writer把开始processing这个spot写进stream大流，通知前端我开始干活了
      // 2. try catch，把spot和model参数给generateText，让它生成导览词，生成成功则进入内一层try catch，把导览词喂给getOrCreateAudioAsset函数，拿回音频的id和url
      // 3. 两个try都成功了，就用writer把拿到的url和done的状态塞进stream大流，通知前端可以把卡片做成可播放了。否则就writer把状态error和报错塞进大流，前端在卡片上渲染失败信息。
      normalizedSpots.map(async (spotName) => {
        streamGuideEvent(writer, {
          kind: "processing",
          requestId,
          spotName
        });

        // const wikiIntro = await getWikiSummary(spotName, "zh");

        try {
          const { text: intro } = await generateText({
            model: guideTextModel,
            prompt: `请为游客详细介绍“${spotName}”这个景点或者展品。要求：\n1. 模仿导游讲话的形式，语言风格符合${requirements.style}，并且${requirements.other}。\n2. 字数${requirements.length}字左右。\n3. 输出纯文本，不要Markdown、不要使用括号。4. 内容方面，你可以参考如下来自向量数据库的介绍`
          });

          try {
            const { audioAssetId, audioUrl } = await getOrCreateAudioAsset(
              agent,
              guideAudioBucket,
              intro,
              spotName
            );

            console.log(
              `[TTS] ${spotName} persisted asset id=${audioAssetId} url=${audioUrl}`
            );

            streamGuideEvent(writer, {
              kind: "done",
              requestId,
              spotName,
              intro,
              audioUrl
            });

            return true;
          } catch (speechError) {
            console.error(
              `Speech generation failed for ${spotName}`,
              speechError
            );

            streamGuideEvent(writer, {
              kind: "error",
              requestId,
              spotName,
              message: "音频生成失败，请稍后重试或更换语音方案。"
            });

            return false;
          }
        } catch (error) {
          console.error(`Guide generation failed for ${spotName}`, error);
          streamGuideEvent(writer, {
            kind: "error",
            requestId,
            spotName,
            message: "该地点生成失败，请稍后重试。"
          });

          return false;
        }
      })
    );

    const allSucceeded = results.every(Boolean);

    return {
      requestId,
      spots: normalizedSpots,
      message: allSucceeded
        ? `已生成完毕 ${normalizedSpots.join("、")} 的语音导游，用户可以播放了。`
        : "生成出现了一些问题，请重试"
    };
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  // getWeatherInformation,
  // getLocalTime,
  // scheduleTask,
  // getScheduledTasks,
  // cancelScheduledTask,
  routePlan,
  generateGuideIntros,
  generateGuideAudio,
  planAudioGuide
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  }
};
