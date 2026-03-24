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
import { scheduleSchema } from "agents/schedule";
import { GUIDE_DATA_PART, type GuideEvent } from "./shared";
import { getWikiSummary, hashText, synthesizeTtsWithFallback } from "./tts";

const ark = createOpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: "compatible"
} as any);

const guideTextModel = ark.chat("ep-20251101235135-2lkzk");

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
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
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

        const wikiIntro = await getWikiSummary(spotName, "zh");

        try {
          const { text: intro } = await generateText({
            model: guideTextModel,
            prompt: `请为游客详细介绍“${spotName}”这个景点或者展品。要求：\n1. 模仿导游讲话的形式，语言风格符合${requirements.style}，并且${requirements.other}。\n2. 字数${requirements.length}字左右。\n3. 输出纯文本，不要Markdown、不要使用括号。4. 内容方面，你可以参考如下来自维基百科的介绍：${wikiIntro}`
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
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
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
