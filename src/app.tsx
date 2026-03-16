/** biome-ignore-all lint/correctness/useUniqueElementIds: it's alright */

// agents是cloudflare的代理SDK，文档见https://developers.cloudflare.com/agents/api-reference/agents-api/，分为两种：
// （1）server side的Agent class，用来Encapsulates agent logic: connections, state, methods, AI models, error handling。我的后端文件server.ts里用了这个里面的一些东西，不过我的Agent实例不是extends Agent这个class创建的，而是extends了下面的一个叫AiChatAgent的东西。通过某个Agent的class，可以拥有数百万个实例。每个实例都是一个独立运行的微型服务器，从而实现横向扩展。实例通过唯一标识符（用户 ID、电子邮件、工单号等）进行寻址。
// Q：每个实例对应一个用户，里面可以有好多个不同的属于这个用户的session，还是说每个实例对应一个session、每个用户每创建一个对话就有一个新的实例？
// 【A】这个不是固定规则，取决于你用什么 ID 去路由实例。同一个 id 永远命中同一个实例；换一个 id 就是新实例，你可以用userId作为ID，也可以用sessionId作为ID。所以两种都可以。要“用户级长期记忆”→ 每用户一个实例。要“会话强隔离、易删除”→ 每会话一个实例。
// （2）Client-side SDK，一共就仨，AgentClient, useAgent和useAgentChat，是用来建立浏览器和后台的连接的。

// 这里我的后端用的是AIChatAgent这个SDK，前端用的是useAgentChat，根据官方文档（），这俩一起可以实现：前者让消息会自动持久化到 SQLite，断开连接后流会自动恢复，工具调用可以在服务器和客户端之间运行；后者是个hook，用来构建用户界面。
import { useEffect, useState, useRef, useCallback, use, useMemo } from "react";
import { useAgent } from "agents/react";
import { isStaticToolUIPart } from "ai";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "./tools";

// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
// import { Toggle } from "@/components/toggle/Toggle";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import {
  GUIDE_DATA_PART,
  type GuideEvent,
  type GuideSpotStatus
} from "./shared";

// Icon imports
import {
  BugIcon,
  MoonIcon,
  RobotIcon,
  SunIcon,
  TrashIcon,
  PaperPlaneTiltIcon,
  StopIcon,
  CassetteTapeIcon
} from "@phosphor-icons/react";
import { getOrCreateBrowserSessionId } from "./utils";

// List of tools that require human confirmation
// NOTE: this should match the tools that don't have execute functions in tools.ts
// 如下数组里的tool，必需用户confirm才能调用。typeof tools意思是把这个tools的结构提取成一个类型，keyof是指取这个类型里的keys，外面套括号和[]意思是这个toolsRequiringConfirmation是个数组，元素需要符合()里的规定
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation"
];

// 导览卡片数据结构的类型定义
type GuideCardState = {
  requestId: string;
  spotName: string;
  status: GuideSpotStatus;
  intro?: string;
  audioUrl?: string;
  message?: string;
};

// 尖括号里的意思是，键必须覆盖 GuideSpotStatus 里的所有状态，值必须是字符串。
// Record<K, V> 是 TS 内置工具类型，意思是：一个对象，键的类型是 K，值的类型是 V
const guideStatusText: Record<GuideSpotStatus, string> = {
  pending: "等待生成",
  processing: "生成中",
  done: "已完成",
  error: "生成失败"
};

// 判断part是否为guideDataPart
function isGuideDataPart(
  part: unknown
): part is { type: `data-${typeof GUIDE_DATA_PART}`; data: GuideEvent } {
  if (!part || typeof part !== "object") return false;
  const maybePart = part as { type?: string; data?: unknown };
  return maybePart.type === `data-${GUIDE_DATA_PART}` && !!maybePart.data;
}

function getGuideRequestIdFromToolOutput(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const maybeOutput = output as { requestId?: unknown };
  return typeof maybeOutput.requestId === "string"
    ? maybeOutput.requestId
    : undefined;
}

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Check localStorage first, default to dark if not found
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const myBrowserSessionId = useMemo(() => {
    return getOrCreateBrowserSessionId()
  },[]) //依赖数组[]的意思是，只有当这个数组里的变量发生变化时，我才重新去翻localStorage。既然我们传了一个空数组，里面什么都没有，就永远不会发生变化。所以 React 只会在组件第一次加载（Mount）时执行一次

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    // Apply theme class on mount and when theme changes
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);


  // Scroll to bottom on mount
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  const agent = useAgent({
    agent: "chat",
    name: myBrowserSessionId
  });

  const [agentInput, setAgentInput] = useState("");
  const handleAgentInputChange = (
    // 规定event类型，React.ChangeEvent<>意思是它是react的输入变化事件类型也即onChange，尖括号里面的俩东西表示这个事件可能来自这俩html元素中的任意一个，即input或者Textarea
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

    // Send message to agent
    await sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }]
      },
      {
        body: extraData
      }
    );
  };

  const {
    messages: agentMessages, // 前端拿到的是 useAgentChat 返回的 messages，并重命名成 agentMessages
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  const pendingToolCallConfirmation = agentMessages.some((m: UIMessage) =>
    m.parts?.some(
      (part) =>
        isStaticToolUIPart(part) &&
        part.state === "input-available" &&
        // Manual check inside the component
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );

  // 这里每次更新messages都打印一下，看看长啥样。
  // Q：不是说JS会变量提升吗？为什么我把这个代码写在通过useAgentChat解构获取agentMessages之前，它就报错说我不能在声明变量前使用它？
  // A：var：会提升并初始化为 undefined，提前读不会立刻报错（但很坑）。let/const：也会“被提升到作用域顶部做登记”，但在声明语句之前处于 TDZ（暂时性死区），提前访问会报错。
  useEffect(() => {
    console.log("[agentMessages]", agentMessages);
  }, [agentMessages]);

  const guideCardsByRequest = useMemo(() => {
    const requestMap = new Map<
      string,
      {
        order: number;
        cards: Map<string, GuideCardState>;
      }
    >();
    let order = 0;

    for (const message of agentMessages) {
      const parts = message.parts ?? [];

      for (const part of parts) {
        if (!isGuideDataPart(part)) continue;
        const event = part.data;

        if (!requestMap.has(event.requestId)) {
          requestMap.set(event.requestId, {
            order: order++,
            cards: new Map<string, GuideCardState>()
          });
        }

        const requestItem = requestMap.get(event.requestId)!;

        if (event.kind === "init") {
          for (const spotName of event.spots) {
            requestItem.cards.set(spotName, {
              requestId: event.requestId,
              spotName,
              status: "pending"
            });
          }
          continue;
        }

        const existing = requestItem.cards.get(event.spotName) ?? {
          requestId: event.requestId,
          spotName: event.spotName,
          status: "pending" as const
        };

        if (event.kind === "processing") {
          requestItem.cards.set(event.spotName, {
            ...existing,
            status: "processing"
          });
        }

        if (event.kind === "done") {
          requestItem.cards.set(event.spotName, {
            ...existing,
            status: "done",
            intro: event.intro,
            audioUrl: event.audioUrl
          });
        }

        if (event.kind === "error") {
          requestItem.cards.set(event.spotName, {
            ...existing,
            status: "error",
            message: event.message
          });
        }
      }
    }

    return new Map(
      Array.from(requestMap.entries())
        .sort((a, b) => a[1].order - b[1].order)
        .map(([requestId, item]) => [requestId, Array.from(item.cards.values())])
    );
  }, [agentMessages]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleGuideAudioPlay = (
    event: React.SyntheticEvent<HTMLAudioElement>
  ) => {
    const currentAudio = event.currentTarget;
    const allGuideAudios = document.querySelectorAll<HTMLAudioElement>(
      'audio[data-guide-audio="true"]'
    );

    allGuideAudios.forEach((audio) => {
      if (audio !== currentAudio && !audio.paused) {
        audio.pause();
      }
    });
  };

  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <HasOpenAIKey />
      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
        {/* 头部盒子 */}
        <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 bg-red-100 dark:bg-[#66ccff] flex items-center gap-3 sticky top-0 z-10">
          <div className="flex items-center justify-center h-8 w-8">
            {/* 左侧图标 */}
            <svg
              width="28px"
              height="28px"
              className="text-[#F48120]"
              data-icon="agents"
            >
              <title>Cloudflare Agents</title>
              <symbol id="ai:local:agents" viewBox="0 0 80 79">
                <path
                  fill="currentColor"
                  d="M69.3 39.7c-3.1 0-5.8 2.1-6.7 5H48.3V34h4.6l4.5-2.5c1.1.8 2.5 1.2 3.9 1.2 3.8 0 7-3.1 7-7s-3.1-7-7-7-7 3.1-7 7c0 .9.2 1.8.5 2.6L51.9 30h-3.5V18.8h-.1c-1.3-1-2.9-1.6-4.5-1.9h-.2c-1.9-.3-3.9-.1-5.8.6-.4.1-.8.3-1.2.5h-.1c-.1.1-.2.1-.3.2-1.7 1-3 2.4-4 4 0 .1-.1.2-.1.2l-.3.6c0 .1-.1.1-.1.2v.1h-.6c-2.9 0-5.7 1.2-7.7 3.2-2.1 2-3.2 4.8-3.2 7.7 0 .7.1 1.4.2 2.1-1.3.9-2.4 2.1-3.2 3.5s-1.2 2.9-1.4 4.5c-.1 1.6.1 3.2.7 4.7s1.5 2.9 2.6 4c-.8 1.8-1.2 3.7-1.1 5.6 0 1.9.5 3.8 1.4 5.6s2.1 3.2 3.6 4.4c1.3 1 2.7 1.7 4.3 2.2v-.1q2.25.75 4.8.6h.1c0 .1.1.1.1.1.9 1.7 2.3 3 4 4 .1.1.2.1.3.2h.1c.4.2.8.4 1.2.5 1.4.6 3 .8 4.5.7.4 0 .8-.1 1.3-.1h.1c1.6-.3 3.1-.9 4.5-1.9V62.9h3.5l3.1 1.7c-.3.8-.5 1.7-.5 2.6 0 3.8 3.1 7 7 7s7-3.1 7-7-3.1-7-7-7c-1.5 0-2.8.5-3.9 1.2l-4.6-2.5h-4.6V48.7h14.3c.9 2.9 3.5 5 6.7 5 3.8 0 7-3.1 7-7s-3.1-7-7-7m-7.9-16.9c1.6 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.4-3 3-3m0 41.4c1.6 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.4-3 3-3M44.3 72c-.4.2-.7.3-1.1.3-.2 0-.4.1-.5.1h-.2c-.9.1-1.7 0-2.6-.3-1-.3-1.9-.9-2.7-1.7-.7-.8-1.3-1.7-1.6-2.7l-.3-1.5v-.7q0-.75.3-1.5c.1-.2.1-.4.2-.7s.3-.6.5-.9c0-.1.1-.1.1-.2.1-.1.1-.2.2-.3s.1-.2.2-.3c0 0 0-.1.1-.1l.6-.6-2.7-3.5c-1.3 1.1-2.3 2.4-2.9 3.9-.2.4-.4.9-.5 1.3v.1c-.1.2-.1.4-.1.6-.3 1.1-.4 2.3-.3 3.4-.3 0-.7 0-1-.1-2.2-.4-4.2-1.5-5.5-3.2-1.4-1.7-2-3.9-1.8-6.1q.15-1.2.6-2.4l.3-.6c.1-.2.2-.4.3-.5 0 0 0-.1.1-.1.4-.7.9-1.3 1.5-1.9 1.6-1.5 3.8-2.3 6-2.3q1.05 0 2.1.3v-4.5c-.7-.1-1.4-.2-2.1-.2-1.8 0-3.5.4-5.2 1.1-.7.3-1.3.6-1.9 1s-1.1.8-1.7 1.3c-.3.2-.5.5-.8.8-.6-.8-1-1.6-1.3-2.6-.2-1-.2-2 0-2.9.2-1 .6-1.9 1.3-2.6.6-.8 1.4-1.4 2.3-1.8l1.8-.9-.7-1.9c-.4-1-.5-2.1-.4-3.1s.5-2.1 1.1-2.9q.9-1.35 2.4-2.1c.9-.5 2-.8 3-.7.5 0 1 .1 1.5.2 1 .2 1.8.7 2.6 1.3s1.4 1.4 1.8 2.3l4.1-1.5c-.9-2-2.3-3.7-4.2-4.9q-.6-.3-.9-.6c.4-.7 1-1.4 1.6-1.9.8-.7 1.8-1.1 2.9-1.3.9-.2 1.7-.1 2.6 0 .4.1.7.2 1.1.3V72zm25-22.3c-1.6 0-3-1.3-3-3 0-1.6 1.3-3 3-3s3 1.3 3 3c0 1.6-1.3 3-3 3"
                />
              </symbol>
              <use href="#ai:local:agents" />
            </svg>
          </div>

          <div className="flex-1">
            <h2 className="font-semibold text-base">瑜的AI Chat Agent</h2>
          </div>

          {/* debug模式的按钮 */}
          {/* <div className="flex items-center gap-2 mr-2">
            <BugIcon size={16} />
            <Toggle
              toggled={showDebug}
              aria-label="Toggle debug mode"
              onClick={() => setShowDebug((prev) => !prev)}
            />
          </div> */}

          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
          </Button>

          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={clearHistory}
          >
            <TrashIcon size={20} />
          </Button>

          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            // onClick={clearHistory}
          >
            <CassetteTapeIcon size={20} />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)] bg-blue-100">
          {agentMessages.length === 0 && (
            <div className="h-full flex items-center justify-center bg-red-100">
              {/* Card组件在app.tsx里第一次出现，它负责展示无对话情况下的欢迎卡片 */}
              <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
                <div className="text-center space-y-4">
                  <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
                    <RobotIcon size={24} />
                  </div>
                  <h3 className="font-semibold text-lg">你好！我是菠萝瑜</h3>
                  <p className="text-muted-foreground text-sm">
                    Start a conversation with your AI assistant. Try asking
                    about:
                  </p>
                  <ul className="text-sm text-left space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Weather information for any city</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Local time in different locations</span>
                    </li>
                  </ul>
                </div>
              </Card>
            </div>
          )}

          {agentMessages.map((m, index) => {
            // isUser是个布尔值，判断当前渲染的这条消息是不是user的，是则为true。
            const isUser = m.role === "user";
            // showAvatar也是个布尔值，判断如果index不为0的话，渲染的上一条消息是不是不等于当前消息，如果不等于则为true，这是为了如果ai连续发送几条消息，后续消息不需要展示头像
            const showAvatar =
              index === 0 || agentMessages[index - 1]?.role !== m.role;

            return (
              // 这里必须有一个key，因为react使用map渲染时，给每个元素都必须加一个独一无二的key，让react知道哪个是哪个
              // message的最外层大框，主要是放1. bug提示 2.消息
              <div key={m.id}>
                {/* 如果出现了bug则渲染这个 */}
                {showDebug && (
                  // <pre> 是 HTML 的“预格式化文本”标签：会保留空格和换行，适合展示日志、代码、JSON。
                  <pre className="text-xs text-muted-foreground overflow-scroll">
                    {/* 参数null代表不做字段筛选替换，参数2代表缩进2个空格 */}
                    {JSON.stringify(m, null, 2)}
                  </pre>
                )}
                {/* message的第二层框，没啥实际意义，主要是为了让isUser为真时让它里面的整块东西justify-end显示，否则就justify-start显示 */}
                <div
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex gap-2 max-w-[85%] ${
                      // flex-row-reverse意思是让比方说123三个元素按照321靠右排列。flex-row就是123靠左排列。这里和上面的justify的用处区别
                      isUser ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* 头像。如果是ai且是首条消息，则显示ai头像；如果是ai但非首条或是用户，则不需要头像 */}
                    {showAvatar && !isUser ? (
                      <Avatar username={"瑜"} className="shrink-0" tooltip={"我是瑜"}/>
                    ) : (
                      !isUser && <div className="w-8" />
                    )}
                    {/* 消息气泡最外层盒子 */}
                    <div>
                      {/* 消息气泡第二层盒子 */}
                      <div>
                        {/* 渲染message里的parts们，如果part是text，渲染一版；如果是调用工具，渲染另一种 */}
                        {m.parts?.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              // biome-ignore lint/suspicious/noArrayIndexKey: immutable index
                              // 消息气泡第三层盒子，分成2部分，一部分是Card组件，一部分是发送时间。
                              <div key={i}>
                                {/* Card组件第二次出现，对话框，用户和ai的样式不同 */}
                                <Card
                                  className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                                    isUser
                                      ? "rounded-br-none" // 右下角的圆角去掉，变直角
                                      : "rounded-bl-none border-assistant-border" // 左下角的圆角去掉，变直角；给 AI 气泡加边框色
                                  } ${
                                    part.text.startsWith("scheduled message")
                                      ? "border-accent/50" //设置边框颜色为强调色，50%透明度
                                      : ""
                                  } relative`}
                                >
                                  {part.text.startsWith(
                                    "scheduled message"
                                  ) && (
                                    <span className="absolute -top-3 -left-2 text-base">
                                      🕒
                                    </span>
                                  )}

                                  <MemoizedMarkdown
                                    // 用消息 id + 当前 part 索引拼一个唯一标识
                                    id={`${m.id}-${i}`}
                                    // 渲染part.text。如果开头是“scheduled message: ”，替换成空的也即删掉
                                    content={part.text.replace(
                                      /^scheduled message: /,
                                      ""
                                    )}
                                  />
                                </Card>

                                {/* 时间戳。随着气泡的左右也靠左/右展示 */}
                                <p
                                  className={`text-xs text-muted-foreground mt-1 ${
                                    isUser ? "text-right" : "text-left"
                                  }`}
                                >
                                  {formatTime(
                                    // 这里的?是可选操作符，如果不存在metadata则返回undefined，不会报错“Cannot read properties of undefined”
                                    m.metadata?.createdAt
                                      ? new Date(m.metadata.createdAt)
                                      : new Date()
                                  )}
                                </p>
                              </div>
                            );
                          }

                          // 如果part是工具调用的内容且是ai发来的，就从part
                          if (
                            isStaticToolUIPart(part) &&
                            m.role === "assistant"
                          ) {
                            const toolCallId = part.toolCallId;
                            const toolName = part.type.replace("tool-", "");
                            const needsConfirmation =
                              toolsRequiringConfirmation.includes(
                                toolName as keyof typeof tools
                              );
                            const guideRequestId =
                              toolName === "planAudioGuide"
                                ? getGuideRequestIdFromToolOutput(part.output)
                                : undefined;
                            const requestCards = guideRequestId
                              ? guideCardsByRequest.get(guideRequestId)
                              : undefined;

                            return (
                              <div
                                // biome-ignore lint/suspicious/noArrayIndexKey: using index is safe here as the array is static
                                key={`${toolCallId}-${i}`}
                                className="space-y-2"
                              >
                                <ToolInvocationCard
                                  toolUIPart={part}
                                  toolCallId={toolCallId}
                                  needsConfirmation={needsConfirmation}
                                  onSubmit={({ toolCallId, result }) => {
                                    addToolResult({
                                      tool: part.type.replace("tool-", ""),
                                      toolCallId,
                                      output: result
                                    });
                                  }}
                                  addToolResult={(toolCallId, result) => {
                                    addToolResult({
                                      tool: part.type.replace("tool-", ""),
                                      toolCallId,
                                      output: result
                                    });
                                  }}
                                />

                                {toolName === "planAudioGuide" &&
                                  requestCards &&
                                  requestCards.length > 0 && (
                                    <div className="space-y-2">
                                      {requestCards.map((card) => (
                                        <Card
                                          key={`${card.requestId}-${card.spotName}`}
                                          className="p-3 rounded-md bg-neutral-100 dark:bg-neutral-900"
                                        >
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-sm">
                                              {card.spotName}
                                            </h4>
                                            <span className="text-xs text-muted-foreground">
                                              {guideStatusText[card.status]}
                                            </span>
                                          </div>

                                          {card.intro && (
                                            <p className="text-sm whitespace-pre-wrap mb-2 line-clamp-6">
                                              {card.intro}
                                            </p>
                                          )}

                                          {card.audioUrl && (
                                            <audio
                                              controls
                                              src={card.audioUrl}
                                              className="w-full"
                                              data-guide-audio="true"
                                              onPlay={handleGuideAudioPlay}
                                            />
                                          )}

                                          {!card.audioUrl &&
                                            (card.status === "pending" ||
                                              card.status === "processing") && (
                                              <p className="text-xs text-muted-foreground">
                                                音频生成中...
                                              </p>
                                            )}

                                          {!card.audioUrl &&
                                            card.status === "done" && (
                                              <p className="text-xs text-muted-foreground">
                                                解说词已生成，但音频未返回。
                                              </p>
                                            )}

                                          {card.status === "error" && (
                                            <p className="text-xs text-red-500">
                                              {card.message ??
                                                "该地点生成失败，请稍后再试。"}
                                            </p>
                                          )}
                                        </Card>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {/* 我们可以看到这里有2处submit，一处是输入框按回车的onkeydown事件调用了handleAgentSubmit函数，一处是按submit按钮触发form的onSubmit里的handleAgentSubmit函数 */}
        {/* 提交逻辑其实放啥元素上都行，反正不涉及DOM取输入框value，因为submit的是setState的agentInput这个变量的值 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAgentSubmit(e, {
              annotations: {
                hello: "world"
              } // 这是handleAgentSubmit的第二个参数，就是函数里提交的extradata，此处无实际含义仅占位
            });
            setTextareaHeight("auto"); // Reset height after submission
          }}
          className="p-3 bg-neutral-50 absolute bottom-0 left-0 right-0 z-10 border-t border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
        >
        {/* form表单内的第一层盒子 */}
          <div className="flex items-center gap-2">
            {/* form表单内的第2层盒子，里面包裹了Textarea和按钮区 */}
            <div className="flex-1 relative">
              {/* 输入区 */}
              <Textarea
                disabled={pendingToolCallConfirmation} // 这是个布尔值，是在上面toolinvocationcard那边定义的，如果为true说明目前需要等待用户批准工具调用，则textarea禁止输入
                // 禁止输入时，输入框的placeholder不同
                placeholder={
                  pendingToolCallConfirmation
                    ? "Please respond to the tool confirmation above..."
                    : "Send a message..."
                }
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2  ring-offset-background placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl text-base! pb-10 dark:bg-neutral-900"
                // 这是一个受控组件，逻辑是：输入框onchange触发handleAgentInputChange(e)，将e.target.value用setState更新agentInput，而输入框的值被更新为=agentinput，这样写的好处是方便我后面发送完了可以通过setstate('')清空输入框
                value={agentInput}
                onChange={(e) => {
                  handleAgentInputChange(e);
                  // Auto-resize the textarea
                  // 这边必须写，写了以后我的输入框随着我输入内容的增加而自动变高，而不是高度限制。实现逻辑也是
                  e.target.style.height = "auto"; //试了一下这个注释掉也不影响这个功能
                  e.target.style.height = `${e.target.scrollHeight}px`;
                  // 为啥需要给高度也绑个state？如果没有它，发送后被撑大的输入框无法复原。我发现我的关键误区在于：清空输入框的setagentInput('')根本不会触发onChange，只有用户的手动修改才会。所以我们需要状态绑定，让发送后清空输入框后，下面的发送逻辑里会setstate一下，导致style={{height: textareaHeight}}的变动，从而实时改变输入框高度。
                  setTextareaHeight(`${e.target.scrollHeight}px`);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    // 判断是不是正在输入法拼字中（比如中文拼音还没选词）
                    !e.nativeEvent.isComposing
                  ) {
                    // 阻止浏览器默认行为，避免enter触发什么别的，就按照我写的来
                    e.preventDefault();
                    // 调用sendMessage提交当前agentInput的值。括号里是因为此处e是键盘事件类型，但是handleAgentSubmit函数里e的类型定义为React.FormEvent（规定成formevent是因为下面的button点击是发消息的主要动作，button的type是submit）
                    handleAgentSubmit(e as unknown as React.FormEvent);
                    setTextareaHeight("auto"); // Reset height on Enter submission
                  }
                }}
                rows={2} // 设定输入框默认高度为2行。改它可以看到它变高/变扁
                style={{ height: textareaHeight }} // 让输入框高度随着文字高度改变
              />

              {/* 发送按钮，分成2种情况，如果当前模型处在输出状况中，就渲染停止按钮，否则渲染发送按钮 */}
              <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
                {status === "submitted" || status === "streaming" ? (
                  <button
                    type="button" // 因为form里的button的type默认是submit，这里写type=button是为了告诉浏览器这只是个普通按钮不触发submit
                    onClick={stop}
                    className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                    aria-label="Stop generation"
                  >
                    <StopIcon size={16} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                    disabled={pendingToolCallConfirmation || !agentInput.trim()}
                    aria-label="Send message"
                  >
                    <PaperPlaneTiltIcon size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const hasOpenAiKeyPromise = fetch("/check-open-ai-key").then((res) =>
  res.json<{ success: boolean }>()
);

function HasOpenAIKey() {
  const hasOpenAiKey = use(hasOpenAiKeyPromise);

  if (!hasOpenAiKey.success) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-500/10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-red-200 dark:border-red-900 p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <svg
                  className="w-5 h-5 text-red-600 dark:text-red-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-labelledby="warningIcon"
                >
                  <title id="warningIcon">Warning Icon</title>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
                  OpenAI API Key Not Configured
                </h3>
                <p className="text-neutral-600 dark:text-neutral-300 mb-1">
                  Requests to the API, including from the frontend UI, will not
                  work until an OpenAI API key is configured.
                </p>
                <p className="text-neutral-600 dark:text-neutral-300">
                  Please configure an OpenAI API key by setting a{" "}
                  <a
                    href="https://developers.cloudflare.com/workers/configuration/secrets/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 dark:text-red-400"
                  >
                    secret
                  </a>{" "}
                  named{" "}
                  <code className="bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded text-red-600 dark:text-red-400 font-mono text-sm">
                    OPENAI_API_KEY
                  </code>
                  . <br />
                  You can also use a different model provider by following these{" "}
                  <a
                    href="https://github.com/cloudflare/agents-starter?tab=readme-ov-file#use-a-different-ai-model-provider"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 dark:text-red-400"
                  >
                    instructions.
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
