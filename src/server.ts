import { routeAgentRequest, type Schedule } from "agents"; // 从 agents 库（Cloudflare 官方封装的一个包）里导入的函数，用来把 HTTP 请求分发给具体的 Agent。文档见https://developers.cloudflare.com/agents/api-reference/routing/，Agents are accessed via URL patterns。这是 ES6 标准模块导入语法，相当于 Python 的 from module import specific_function。那个 type 关键字是 TypeScript 特有的。它表示 Schedule 只是一个类型定义（Type Definition），编译成 JavaScript 后这东西会消失。这告诉编译器：“我只想要这个类型检查，不需要它的运行代码。”
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
// 这里导入了一个生成提示词的函数 getSchedulePrompt，以及一个基类 AIChatAgent。你的 Chat 类稍后会继承这个基类。
// 功能包括：内置消息持久性，自动断点续传（中途重新连接），useAgentChat可与React Hook配合使用。文档：https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent/
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
// AI SDK 由 Next.js 的创建者开发，是一个免费的开源库，它为您提供构建 AI 驱动产品所需的工具。https://ai-sdk.dev/

// 1. 修改引入：从直接引入 openai 改为引入 createOpenAI 用于自定义配置
import { createOpenAI } from "@ai-sdk/openai"; // createOpenAI 是一个工厂函数，从 ai-sdk/openai 包中导入，用于创建自定义配置的 OpenAI 客户端实例
import { processToolCalls, cleanupMessages } from "./utils"; // 导入自定义的工具调用处理和消息清理函数
import { tools, executions } from "./tools"; // 导入自定义工具和执行器
import { getTtsText } from "./tts-cache";

// 2. 配置火山引擎 (Ark) 客户端
// 对应你 Python 代码里的 base_url 和 client 初始化
const ark = createOpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.OPENAI_API_KEY, // 这里会自动读取你 .dev.vars 里的 Key。process 是 Node.js (以及这里模拟 Node 环境) 的全局变量。
  compatibility: "compatible" // 使用兼容模式以确保与 OpenAI API 的兼容性。这是我们为了解决 SDK 报错强制加的参数。
} as any); // 这是 TypeScript 的“断言” (Type Assertion).使用 `as any` 是为了绕过 TypeScript 的类型检查，避免因类型不匹配而报错。这在某些情况下是必要的，尤其是当第三方库的类型定义不完全符合实际使用时。

// 3. 定义模型
// 对应你 Python 代码里的 model="ep-20251101235135-2lkzk"
const model = ark.chat("ep-20251101235135-2lkzk"); //使用上面创建的 ark 客户端，调用它的 .chat() 方法, 并传入模型 ID，来创建一个特定的聊天模型实例。

const normalizeTextForFasterTts = (text: string) => {
  return text
    .replace(/\s+/g, " ")
    .replace(/[“”‘’"']/g, "")
    .replace(/[。！？!?；;：:]/g, "，")
    .replace(/[（(][^)）]*[)）]/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9，,。.!?！？；;：:\-—\s]/g, "")
    .replace(/，{2,}/g, "，")
    .trim();
};

const splitTextForTts = (text: string, maxLength = 110) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return [normalized];

  const segments: string[] = [];
  let current = "";
  const parts = normalized.split(/([。！？!?；;，,])/g);

  for (let index = 0; index < parts.length; index += 2) {
    const content = parts[index] ?? "";
    const punctuation = parts[index + 1] ?? "";
    const sentence = `${content}${punctuation}`.trim();
    if (!sentence) continue;

    if (current.length + sentence.length > maxLength) {
      if (current) segments.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current) segments.push(current);
  return segments.length > 0 ? segments : [normalized];
};

const fetchGoogleTtsChunk = async (
  chunk: string,
  index: number,
  total: number,
  fullTextLength: number
) => {
  const endpoints = [
    {
      baseUrl: "https://translate.google.com/translate_tts",
      client: "tw-ob"
    },
    {
      baseUrl: "https://translate.googleapis.com/translate_tts",
      client: "gtx"
    }
  ] as const;

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    const url = new URL(endpoint.baseUrl);
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("tl", "zh-CN");
    url.searchParams.set("client", endpoint.client);
    url.searchParams.set("q", chunk);
    url.searchParams.set("idx", String(index));
    url.searchParams.set("total", String(total));
    url.searchParams.set("textlen", String(fullTextLength));

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "audio/mpeg,*/*"
      }
    });

    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) {
        errors.push(`${endpoint.client}: empty audio`);
      } else {
        return bytes;
      }
    } else {
      errors.push(`${endpoint.client}: HTTP ${response.status}`);
    }
  }

  throw new Error(errors.join(" | "));
};

const synthesizeGoogleTts = async (text: string): Promise<Uint8Array> => {
  const optimizedText = normalizeTextForFasterTts(text);
  const chunks = splitTextForTts(optimizedText);
  const buffers: Uint8Array[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    let lastError: unknown;

    for (let retry = 0; retry < 2; retry++) {
      try {
        const bytes = await fetchGoogleTtsChunk(
          chunk,
          index,
          chunks.length,
          optimizedText.length
        );
        buffers.push(bytes);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (retry === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }

    if (lastError) {
      throw new Error(
        `Google TTS chunk failed at index ${index}: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`
      );
    }
  }

  const merged = Buffer.concat(buffers.map((buffer) => Buffer.from(buffer)));
  if (!merged.length) {
    throw new Error("Google TTS merged audio is empty");
  }

  return new Uint8Array(merged);
};

const synthesizeTtsWithFallback = async (text: string): Promise<Uint8Array> => {
  const googleAudio = await synthesizeGoogleTts(text);
  console.log("[TTS Proxy] provider=google-fast-normalized");
  return googleAudio;
};

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */

// export: 导出这个类，让其他文件（比如 server.ts 入口）能引用它。

// class Chat: 定义一个叫 Chat 的类（蓝图）。

// extends AIChatAgent<Env>:

// 继承 (Inheritance)：这是一个核心概念。AIChatAgent 是官方库里已经写好了一个“超级父类”，它里面已经包含了管理数据库、保存聊天记录等复杂功能。

// 你的 Chat 类只要继承它，就自动拥有了那些能力，不需要你重写。

// <Env> (泛型)：告诉父类，我们的环境变量类型是 Env（刚才定义的那个接口），这样父类内部也能正确提示 OPENAI_API_KEY。

// 父类（AIChatAgent） 的底层代码里写了一段逻辑，大概意思是：“当即收到用户请求时，我就去找一个叫 onChatMessage 的方法来执行。”
// 子类 Chat 的任务就是：按父类的要求，把这个同名的方法定义出来，填上具体的逻辑。

export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */

  // async是异步函数，代表咱现在给你去办事儿了，它返回值是一个promise，意思是承诺俺待会儿会把结果返回给你。这里我们可以看到它最后return createUIMessageStreamResponse({ stream })

  // 这里开始，是chat类的第一个方法onChatMessage。
  // 注意这里是在定义onChatMessage这个函数，但没有写构造函数function，这是为什么呢？因为根据ES6语法，在class内部定义一个方法是不能写function的！其实就是为了偷懒（简洁）。因为在类里面，我们写的每一块代码基本上都是函数，如果每一行都写 function、function、function，代码会显得很啰嗦。
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools
      // ...this.mcp.getAITools()
    };

    // const stream = createUIMessageStream()是在调用createUIMessageStream这个函数，并且这个函数传入的参数是一个对象，这个对象只有一个属性是execute，其实这个execute就是冒号后面那一大坨东西、本质上是一个函数且其返回值是promise对象，这个promise对象一共await了俩东西，一个是processedMessages（此物是调用processToolCalls的返回值），一个是messages。然后result这个变量是调用了streamText函数，传入了一个巨大obj包含了system prompt、经过各种函数处理过的用户messages、当前模型、工具等。最后的最后，onChatMessage()调用了createUIMessageStreamResponse函数把stream传入得到了一个response，虽然我不知道这个response是长啥样，但我猜它应该是返回了一个流式输出，这个对象包含了模型对用户问题的回答和其它所需的信息，从而让前端可以直接用这个信息生成界面，并且字是一个个蹦出来的。
    // execute:这个写法是为了保证传参的可扩展性
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        // 1. 第一步，这个cleanedMessages是用来清理消息的：
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `你是一个智能导游助手。

当用户表达“帮我生成从A到B到C的语音解说”“给我这些地点做语音导览”等相似意图时，优先调用 planAudioGuide 工具，并正确提取地点列表。
当用户仅是普通聊天，不需要调用该工具。

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: await convertToModelMessages(processedMessages),
          model, // 这里使用的是上面定义的火山引擎模型
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          experimental_context: {
            writer
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

  // 这里开始，是chat类的第二个方法executeTask
  // 理解这里的schedule类型定义和泛型：见myNotesForLearn.ts

  // 这个函数在当前的代码里，只做了一件事——往聊天记录（数据库）里塞了一条“假装是用户发的新消息”，然后就结束了。它没有直接去调大模型，也没有直接去调工具。
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
  // 这个函数并没有直接执行业务逻辑，而是玩了个“假传圣旨”的套路：它往聊天记录里塞了一条假装是用户发的“Running scheduled task: xxx”消息，并且可能设置了定时器（如八点）。由于 AIChatAgent 这个基类（父类）通常有监听机制（或者 Cloudflare Worker 的机制），一旦数据库里的消息更新了，或者紧接着这个动作之后，系统会自动唤醒 AI：“嘿，有新消息了，你快看看！”。AI 看到‘用户’刚才发了一条消息说‘Running scheduled task: 提醒我看书’，就会顺势生成回复（比如“八点的闹钟响了，快去看书”），从而完成了任务闭环。
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/tts-proxy/")) {
      const ttsId = url.pathname.replace("/tts-proxy/", "").trim();
      const text = getTtsText(ttsId);

      if (!text) {
        return new Response("TTS text not found or expired", { status: 404 });
      }

      try {
        const audioBytes = await synthesizeTtsWithFallback(text);
        const audioBuffer = audioBytes.buffer.slice(
          audioBytes.byteOffset,
          audioBytes.byteOffset + audioBytes.byteLength
        ) as ArrayBuffer;
        return new Response(audioBuffer, {
          headers: {
            "content-type": "audio/mpeg",
            "cache-control": "public, max-age=3600"
          }
        });
      } catch (error) {
        console.error("TTS proxy synthesis failed", error);
        return new Response("TTS proxy synthesis failed", { status: 500 });
      }
    }

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
