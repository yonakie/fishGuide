// ++++++++++++++++理解chat类的第二个方法executeTask这里的schedule类型定义和泛型+++++++++++++++++++

/**
 * 核心类型定义：日程任务 (Schedule)
 * * 1. <T = string>: 【泛型默认值】
 * - 意思：这个 payload (任务数据) 的类型是灵活的 (T)。
 * - 懒人用法：如果你不特意指定，它默认就是 string (字符串)。
 * - 高手用法：如果你非要存对象，可以用 Schedule<MyObj> 来覆盖它。
 */
type Schedule<T = string> = 
  // === 第一部分：必选套餐 (Base) ===
  // 符号 '&' 表示合并：不管哪种任务，这 3 个字段必须有！
  {
    id: string;        // 任务身份证号
    callback: string;  // 到点后要执行哪个函数名
    payload: T;        // 携带的数据 (默认是字符串，由上面的 T 决定)
  } 
  & 
  // === 第二部分：三选一配菜 (Variants) ===
  // 符号 '|' 表示选择：根据 type 的不同，必须满足下面其中一种结构
  (
    | { 
        type: "scheduled";      // 变体 A：定点闹钟
        time: number;           // 必须给具体时间戳
      }
    | { 
        type: "delayed";        // 变体 B：倒计时炸弹
        time: number;           
        delayInSeconds: number; // 必须给延迟秒数
      }
    | { 
        type: "cron";           // 变体 C：周期循环
        time: number;           
        cron: string;           // 必须给 cron 表达式 (如 "* * * * *")
      }
  );













//   +++++++++++++++++++++++++为什么需要execute: +++++++++++++++++++++++
/**
 * 【知识点笔记】：配置对象模式 (Configuration Object Pattern)
 * * Q: 为什么 createUIMessageStream({ execute: ... }) 要多包一层对象？
 * 而不是直接写成 createUIMessageStream( ... ) ？
 * * A: 这是为了“留后路”和“防混乱”。
 * * Reason 1. 扩展性 (为了未来)：
 * - 如果直接传函数，以后想加“超时时间”或“错误处理”参数，就得改函数签名，
 * - 变成 createUIMessageStream(func, null, null, 5000) 这种“参数地狱”。
 * - 用对象包起来，以后想加新功能，直接往对象里塞属性就行，互不影响：
 * {
 * execute: ...,  // 核心逻辑
 * timeout: 5000, // (未来可能加的新功能)
 * onError: ...   // (未来可能加的新功能)
 * }
 * * Reason 2. 自解释性 (为了读懂)：
 * - 这里的 'execute' 就像一个标签。
 * - 它明确告诉读代码的人：“这个 async 函数是用来【执行核心逻辑】的”，
 * - 而不是用来初始化(onInit)或者收尾(onFinish)的。
 */

// 实际代码示例
// const stream = createUIMessageStream({
//   // 'execute' 是这个配置对象的一个属性，值是一个 async 函数
//   execute: async ({ writer }) => { 
//      // ... 具体的业务逻辑 ...
//   }
// });














//   +++++++++++++++++++++++++  messages变量和part变量长啥样: +++++++++++++++++++++++

// 你推测得很准：在这个项目里，messages 是“消息数组”，数组里每一项是一条消息对象；每条消息里有 parts 数组，用来承载这条消息的不同片段。

// - 前端拿到的是 useAgentChat 返回的 messages，并重命名成 agentMessages，见 app.tsx
// - 渲染时就是遍历消息，再遍历每条消息的 parts，见 app.tsx
// - 后端工具确认与清理逻辑也都是按 message.parts 处理，见 utils.ts

// 一个非常贴近你项目的示例（简化版）：

// - messages（数组）
[
  {
    id: "m1",
    role: "user",
    parts: [
      { type: "text", text: "帮我做故宫和天坛的语音导览" }
    ],
    metadata: { createdAt: "2026-03-04T10:00:00.000Z" }
  },
  {
    id: "m2",
    role: "assistant",
    parts: [
      {
        type: "tool-planAudioGuide",
        toolCallId: "tc_1",
        state: "output-available",
        input: { spots: ["故宫", "天坛"] },
        output: {
          requestId: "req_123",
          spots: ["故宫", "天坛"],
          message: "已开始生成 故宫、天坛 的语音导游。"
        }
      }
    ],
    metadata: { createdAt: "2026-03-04T10:00:02.000Z" }
  },
  {
    id: "m3",
    role: "assistant",
    parts: [
      {
        type: "data-guide_event",
        data: { kind: "processing", requestId: "req_123", spotName: "故宫" }
      },
      {
        type: "data-guide_event",
        data: {
          kind: "done",
          requestId: "req_123",
          spotName: "故宫",
          intro: "……导览词……",
          audioUrl: "/tts-proxy/abc"
        }
      }
    ]
  }
]

// 再给你一个“需要人工确认工具”的典型 part（对应 getWeatherInformation）：

// - tool part（等待确认）
const note = {
  type: "tool-getWeatherInformation",
  toolCallId: "tc_weather_1",
  state: "input-available",
  input: { city: "北京" },
};

