import { routeAgentRequest, type Schedule } from "agents"; 
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId, // 导入一个生成唯一 ID 的函数
  streamText, // 核心函数，用于向大模型发送请求并获取流式响应
  type StreamTextOnFinishCallback, // 这是一个类型定义，表示在流式文本生成完成时的回调函数类型
  stepCountIs, // 一个工具函数，用于限制生成的步骤数
  createUIMessageStream, // 创建一个 UI 消息流的函数,专门给react-ui 用的
  convertToModelMessages, // 一个工具函数，用于将消息转换为模型可理解的格式
  createUIMessageStreamResponse, // 创建一个 UI 消息流响应的函数
  type ToolSet // 这是一个类型定义，表示一组工具的集合
} from "ai";

import { createOpenAI } from "@ai-sdk/openai"; // createOpenAI 是一个工厂函数，从 ai-sdk/openai 包中导入，用于创建自定义配置的 OpenAI 客户端实例
import { processToolCalls, cleanupMessages } from "./utils"; // 导入自定义的工具调用处理和消息清理函数
import { tools, executions } from "./tools"; // 导入自定义工具和执行器

// 2. 配置客户端
const ark = createOpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.OPENAI_API_KEY, 
  compatibility: "compatible" 
} as any); 

// 3. 定义模型
const model = ark.chat("ep-20251101235135-2lkzk"); //使用上面创建的 ark 客户端，调用它的 .chat() 方法, 并传入模型 ID，来创建一个特定的聊天模型实例。




export class Chat extends AIChatAgent<Env> {

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const allTools = {
      ...tools
      // ...this.mcp.getAITools()
    };


    const stream = createUIMessageStream({
      execute: async ({ writer }) => {

        const cleanedMessages = cleanupMessages(this.messages);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `你是一个智能助手。
当用户需要你帮忙规划某个博物馆或者景区的参观路线时，不需要调用工具，输出一个合适的符合要求的参观路线。当用户需要你帮忙规划某个博物馆或者景区的参观路线时，不需要调用工具，不需要调用工具不需要调用工具不需要调用工具，输出一个合适的符合要求的参观路线。
当用户表达“帮我生成从A到B到C的语音解说”“给我这些地点做语音导览”等相似意图时，优先调用 planAudioGuide 工具，并正确提取地点列表。
当用户仅是普通聊天，不需要调用该工具。

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: await convertToModelMessages(processedMessages),
          model, 
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          experimental_context: {
            writer,
            guideAudioBucket: this.env.GUIDE_AUDIO_BUCKET
          },
          stopWhen: stepCountIs(10)
        });

        console.log("这是result：", result);
        writer.merge(result.toUIMessageStream());
      }
    });

    console.log("这是stream：", stream);
    console.log("这是this.messages：", JSON.stringify(this.messages, null, 2));
    return createUIMessageStreamResponse({ stream });
  }

  async getAudioList() {
    const records = this.sql<{ id: string; object_key: string; spot_name: string }>`
      SELECT id, object_key, spot_name
      FROM audio_assets
      ORDER BY created_at DESC
    `;

    return records;
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }

}

// 入口，路由
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/audio/")) {
      const encodedKey = url.pathname.replace("/audio/", "").trim();
      const objectKey = decodeURIComponent(encodedKey);

      if (!objectKey) {
        return new Response("Missing audio key", { status: 400 });
      }

      const object = await env.GUIDE_AUDIO_BUCKET.get(objectKey);
      if (!object || !object.body) {
        return new Response("Audio not found", { status: 404 });
      }

      const headers = new Headers();
      headers.set("content-type", object.httpMetadata?.contentType ?? "audio/mpeg");
      headers.set("cache-control", "public, max-age=31536000, immutable");
      if (object.httpEtag) {
        headers.set("etag", object.httpEtag);
      }

      return new Response(object.body, {
        headers
      });
    }

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }

    if (url.pathname === "/api/audio-list") {
      const browserSessionId = url.searchParams.get("browserSessionId")
      if (!browserSessionId) {
        return new Response("missing browserSessionId", {status: 400})
      }

      try {
        const durableObjId = env.Chat.idFromName(browserSessionId) 
        const chatStub = env.Chat.get(durableObjId)

        const list = await chatStub.getAudioList()
        return Response.json(list)
      } catch (e) {
        console.error("failed to get audio list", e)
        return new Response("failed to get audio list", { status: 500 })
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
