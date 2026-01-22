import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

// 1. 配置 AI 客户端 (照搬你之前的配置)
// 注意：这里我们是在函数外部初始化配置，这在 Worker 里是允许的，但为了安全读取 env，通常建议放在 fetch 内部，
// 不过为了演示简单，我们把配置逻辑放在 fetch 里。

export default {
  // 这是 Cloudflare Worker 的标准入口函数
  // request: 用户发来的请求
  // env: 环境变量（包含你的 API Key）
  async fetch(request: Request, env: any): Promise<Response> {
    
    // === A. 准备阶段 ===
    console.log("收到请求！开始处理...");

    // 检查 API Key 是否存在
    if (!env.OPENAI_API_KEY) {
      return new Response("错误: 没找到 OPENAI_API_KEY", { status: 500 });
    }

    // 初始化火山引擎客户端 (和你之前改的一模一样)
    const ark = createOpenAI({
      baseURL: "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: env.OPENAI_API_KEY,
      compatibility: 'compatible',
    } as any);

    // 强制使用 Chat 模式
    const model = ark.chat("ep-20251101235135-2lkzk");

    // === B. AI 思考阶段 ===
    try {
      // 使用 generateText (生成一次性文本，而不是流式 streamText，方便测试)
      const { text } = await generateText({
        model: model,
        prompt: "输出以下内容：呱呱呱", // 这里写死一个 Prompt
      });

      console.log("AI 生成完毕:", text);

      // === C. 返回结果 ===
      return new Response(text, {
        headers: { 
            "content-type": "text/plain; charset=utf-8" // 确保中文不乱码
        } 
      });

    } catch (error) {
      console.error("AI 调用失败:", error);
      return new Response(`出错了: ${error}`, { status: 500 });
    }
  },
};