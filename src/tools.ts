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
import { hashText, synthesizeTtsWithFallback } from "./tts";

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
      UNIQUE(text_hash, voice)
    )
  `;
};

const getOrCreateAudioAsset = async (
  agent: Chat,
  bucket: R2Bucket,
  intro: string
) => {
  ensureAudioAssetsTable(agent);

  const textHash = await hashText(intro);
  const voice = "google-tts-zh-CN-v1";
  const objectKey = `guide-audio/${textHash}.mp3`;

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
      voice
    }
  });

  const audioAssetId = crypto.randomUUID();
  agent.sql`
    INSERT INTO audio_assets (id, text_hash, object_key, voice, created_at)
    VALUES (${audioAssetId}, ${textHash}, ${objectKey}, ${voice}, ${new Date().toISOString()})
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
    "当用户希望生成从多个地点串联的语音解说时，提取地点列表并并行生成每个地点的讲解与音频。",
  inputSchema: z.object({
    spots: z
      .array(z.string())
      .min(1)
      .describe("用户希望解说的地点或展品名称列表")
  }),
  execute: async ({ spots }, options) => {
    const { agent } = getCurrentAgent<Chat>();
    if (!agent) {
      throw new Error("Agent context unavailable for planAudioGuide");
    }

    const guideAudioBucket = (
      options.experimental_context as
        | { guideAudioBucket?: R2Bucket }
        | undefined
    )?.guideAudioBucket;

    if (!guideAudioBucket) {
      throw new Error("R2 bucket unavailable in tool context");
    }

    const normalizedSpots = Array.from(
      new Set(spots.map((spot) => spot.trim()).filter(Boolean))
    );

    const writer = (
      options.experimental_context as
        | { writer?: UIMessageStreamWriter }
        | undefined
    )?.writer;
    const requestId = crypto.randomUUID();

    streamGuideEvent(writer, {
      kind: "init",
      requestId,
      spots: normalizedSpots
    });

    await Promise.all(
      normalizedSpots.map(async (spotName) => {
        streamGuideEvent(writer, {
          kind: "processing",
          requestId,
          spotName
        });

        try {
          const { text: intro } = await generateText({
            model: guideTextModel,
            prompt: `请为游客详细介绍“${spotName}”这个景点或者展品。要求：\n1. 风格生动有趣，像导游一样。\n2. 字数1000字左右。\n3. 输出纯文本，不要Markdown。`
          });

          try {
            const { audioAssetId, audioUrl } = await getOrCreateAudioAsset(
              agent,
              guideAudioBucket,
              intro
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
            return;
          }
        } catch (error) {
          console.error(`Guide generation failed for ${spotName}`, error);
          streamGuideEvent(writer, {
            kind: "error",
            requestId,
            spotName,
            message: "该地点生成失败，请稍后重试。"
          });
        }
      })
    );

    return {
      requestId,
      spots: normalizedSpots,
      message: `已开始生成 ${normalizedSpots.join("、")} 的语音导游。`
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
