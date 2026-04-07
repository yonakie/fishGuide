/** biome-ignore-all lint/correctness/useUniqueElementIds: it's alright */

// 第一部分 你的原始学习笔记（已恢复）
// 1. SDK 概念笔记
// agents 是 cloudflare 的代理 SDK，文档见 https://developers.cloudflare.com/agents/api-reference/agents-api/，分为两种：
// （1）server side 的 Agent class，用来封装连接、状态、方法、AI 模型和错误处理。
        // 你在后端文件 server.ts 里用了其中一些能力；当前实例是 extends AIChatAgent，而不是直接 extends Agent。
        // 通过某个 Agent class 可以拥有大量实例；每个实例都像一个独立运行的微型服务器，按唯一标识符（用户 ID、邮箱、工单号等）寻址。
        // Q：每个实例对应一个用户，还是每个会话一个实例？
        // A：取决于你用什么 ID 路由实例。同一个 id 永远命中同一个实例；换一个 id 就是新实例。
        //    可以用 userId 做实例级长期记忆，也可以用 sessionId 做会话隔离。
// （2）Client-side SDK： 主要是 AgentClient、useAgent、useAgentChat，用来建立浏览器和后台连接。
        // 这里前后端组合是：后端 AIChatAgent + 前端 useAgentChat。
        // 这套组合可实现：消息自动持久化到 SQLite、断线后流自动恢复、工具调用可在服务端和客户端之间运行。

// 2. TypeScript 心智笔记
// var 会提升并初始化为 undefined，提前读取通常不会立刻报错；
// let/const 也会被提升登记，但在声明前处于 TDZ（暂时性死区），提前访问会报错。

// 第一部分 文件级结构定义
// 1. 依赖导入
// 1.1 React 与 Agent SDK
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import { isStaticToolUIPart } from "ai";
import type { UIMessage } from "@ai-sdk/react";

// 1.2 图标与本地组件
import {
  CassetteTapeIcon,
  MoonIcon,
  PaperPlaneTiltIcon,
  StopIcon,
  SunIcon,
  TrashIcon
} from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar/Avatar";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { AudioList } from "@/components/audio-list/AudioList";
import { RouteCard } from "@/components/route-map/RouteCard";
import { Textarea } from "@/components/textarea/Textarea";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

// 1.3 本地类型与工具
import type { tools } from "./tools";
import {
  GUIDE_DATA_PART,
  ROUTE_DATA_PART,
  type GuideEvent,
  type GuideSpotStatus,
  type RouteData,
  type RouteEvent
} from "./shared";
import { getOrCreateBrowserSessionId } from "./utils";









// 2. 常量与类型定义
// 2.1 需要人工确认的工具列表
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  // "getWeatherInformation"
];

// 2.2 导览卡片状态结构
// 导览卡片数据结构的类型定义
type GuideCardState = {
  requestId: string;
  spotName: string;
  status: GuideSpotStatus;
  intro?: string;
  audioUrl?: string;
  message?: string;
};

// 2.3 导览状态文本映射
// 尖括号里的意思是，键必须覆盖 GuideSpotStatus 里的所有状态，值必须是字符串。
// Record<K, V> 是 TS 内置工具类型，意思是：一个对象，键的类型是 K，值的类型是 V
const guideStatusText: Record<GuideSpotStatus, string> = {
  pending: "等待生成",
  processing: "生成中",
  done: "已完成",
  error: "生成失败"
};

// 2.4 导览相关工具名集合
const GUIDE_TOOL_NAMES = new Set([
  "planAudioGuide",
  "generateGuideIntros",
  "generateGuideAudio"
]);







// 3. 顶层工具函数（类型守卫与数据提取）
// 3.1 判断 part 是否为 guideDataPart
function isGuideDataPart(
  part: unknown
): part is { type: `data-${typeof GUIDE_DATA_PART}`; data: GuideEvent } {
  if (!part || typeof part !== "object") return false;
  const maybePart = part as { type?: string; data?: unknown };
  return maybePart.type === `data-${GUIDE_DATA_PART}` && !!maybePart.data;
}

// 3.2 判断 part 是否为 routeDataPart
function isRouteDataPart(
  part: unknown
): part is { type: `data-${typeof ROUTE_DATA_PART}`; data: RouteEvent } {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as { type: string }).type === `data-${ROUTE_DATA_PART}`
  );
}

// 3.3 从导览工具输出提取 requestId
function getGuideRequestIdFromToolOutput(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const maybeOutput = output as { requestId?: unknown };
  return typeof maybeOutput.requestId === "string"
    ? maybeOutput.requestId
    : undefined;
}

// 3.4 从路线工具输出提取 routeId
function getRouteIdFromToolOutput(output: unknown): string | undefined {
  if (typeof output === "object" && output !== null && "routeId" in output) {
    return String((output as { routeId: unknown }).routeId);
  }
  return undefined;
}
















// ++++++++++++++++++第二部分 Chat 主组件+++++++++++++++++++++++
// 1. 组件入口
export default function Chat() {
  // 1.1 基础状态与引用
    // 主题：组件首次挂载时，读取 localStorage 里的 theme并且赋值给theme作为默认值；如果是这个浏览器第一次打开网页，localstorage里没这个值，就给dark。后续普通的重新渲染不会再执行这个初始化函数；只有组件被卸载后再次挂载，才会重新读一次
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [showDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [audioItems, setAudioItems] = useState([]);
  const [agentInput, setAgentInput] = useState("");
    // 注意这个展开卡片功能的state是个集合
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    // 这里的 useRef 主要是拿到一个“稳定的 DOM 引用”，用于滚动到底部。在 JSX 里 <div ref={messagesEndRef} />把这个 ref 绑定到消息列表底部的占位 div，在 scrollToBottom 里调用messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })，这样每次有新消息时，就能平滑滚动到最底部
  const messagesEndRef = useRef<HTMLDivElement>(null);








  // 1.2 会话标识与 Agent 连接
  // 依赖数组 [] 的意思是只在组件首次挂载时执行一次。
  // 这里用于只在首次加载时读取 localStorage 中的 browserSessionId。
  const myBrowserSessionId = useMemo(() => {
    return getOrCreateBrowserSessionId();
  }, []);

  const agent = useAgent({
    agent: "chat",
    name: myBrowserSessionId
  });

    // 关键一步，通过useAgentChat方法，实现前后端通信，拿到agentMessages的消息们和sendMessage方法，后面用
  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });







  // 1.3 消息派生状态，这个废弃了
    //  当前聊天里，是否有“需要用户先确认”的工具调用还没处理完。我这个代码里用不上，因为我没写需要用户确认的tool
  const pendingToolCallConfirmation = agentMessages.some((m: UIMessage) =>
    m.parts?.some(
      (part) =>
        isStaticToolUIPart(part) &&
        part.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );






  // 1.4 两个useMemo的map，整理part.data
  // （1）结构化导览卡片数据，其实就是把part里的关键部分data抠出来然后整理成一个map
  const guideCardsByRequest = useMemo(() => {

    // 第一步，新建一个requestMap对象，它是一个类似字典的东西，一堆键值对，不过键可以有更多花样比如obj。但是，此处我们用requestId作为键。每个requestId，都对应一个obj，包含order和cards，其中cards也是一个map，以spotName为键，其它part.data里的值作为value
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
        // 到这一步为止就是不断遍历然后把part.data从message里抠出来，这是一个长度大概3-5项的obj，包含了所有关键变量，比如data: { kind: "processing", requestId: "req_123", spotName: "故宫" }，如果kind变成done了就加一项intro或者加2项intro和audiourl


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

  // （2）路线的map整理
  const routeDataByRequest = useMemo(() => {
    const map = new Map<string, RouteData>();
    for (const message of agentMessages) {
      for (const part of message.parts ?? []) {
        if (!isRouteDataPart(part)) continue;
        const event = part.data;
        if (event.kind === "route_done") {
          map.set(event.routeId, event.route);
        }
      }
    }
    return map;
  }, [agentMessages]);

/**
 * 【为啥用useMemo：1-把复杂的筛选逻辑抽离；2-避免因为theme等state的改变导致的Chat组件重新渲染时在jsx那边再跑一遍筛选，因为这个项目的所有state都写在Chat组件上，即使agentMessages不变，也会有其它导致Chat重新渲染的事件】
 * 1. 为什么不在 JSX 中直接 messages.map？
 * - 避免性能浪费：数据整理涉及多层遍历、Map 聚合、状态合并与排序。如果在 JSX 中写，组件任何更新都会导致重算。
 * - 处理流式状态流转：原始消息是流（同一请求有 init -> processing -> done）。直接 map 会导致重复渲染，useMemo 可以提前做好去重与状态更新。
 * - 保证顺序稳定：在数据层按首次出现的顺序排好，而不是在渲染层混入排序逻辑。
 * - 关注点分离：数据处理在上方，JSX 只负责“拿最终结果画 UI”，保持代码高可读性。
 *
 * 2. 既然useEffect和useRef的hook也有类似功能，为什么不用 useEffect + useState？
 * useEffect的话是执行顺序问题，Effect 是在渲染之后才执行的。而useMemo是在处理本次渲染的过程中顺溜儿下来执行的。
 * - 避免多余渲染：纯数据推导不是副作用。用 useEffect 会导致“渲染旧数据 -> 执行 effect -> setState -> 渲染新数据”，多一次渲染且可能出现闪烁。
 *
 * 3. 为什么不用 useRef？
 * - 无法驱动 UI：更新 useRef 不会触发组件重渲染，会导致数据变了但界面没更新。
 *
 * 【总结】
 * - useMemo：同步推导计算结果（纯计算、无副作用） -> 本场景最佳。
 * - useEffect：处理副作用（如发请求、操作 DOM）。
 * - useRef：保存不需要触发重渲染的引用。
 */






  // 1.6 通用 UI 工具函数
  // 1.6.1 滚动到底部
    // useRef的使用！先用useRef创建一个盒子，然后把这个盒子在jsx里绑定在消息列表底部的占位 <div>，这样我就可以拿到这个盒子滚动到它那里
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // scrollIntoView() — 让这个 DOM 元素滚动进入视图
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  // 1.6.2 整理时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };





  // 1.7 交互处理函数，都是toggle、handle这种把手，用来传给特定按钮之类的触发setState（以及搭配使用的useEffect）

  // 1.7.1 主题深浅：按钮按下后setState改变theme值
  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  // 改主题就是从classList里增删tailwind
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);



  // 1.7.2 渲染区操作
  // （1）卡片intro展开收起操作
  const toggleCardExpand = useCallback((key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // （2）在卡片里按按钮一键生成intro操作
  const handleGenerateRouteGuide = useCallback(
    async (routeData: RouteData) => {
      const spotNames = routeData.spots.map((s) => s.name_en).join("、");
      await sendMessage(
        {
          role: "user",
          parts: [
            {
              type: "text",
              text:
                `请为以下路线地标生成讲解词：${spotNames}。` +
                `路线从${routeData.startName}出发，终点是${routeData.endName}。`
            }
          ]
        },
        { body: {} }
      );
    },
    [sendMessage]
  );

  // （3）在卡片里按按钮一键生成audio操作
  const handleGenerateAudio = useCallback(
    async (requestId: string) => {
      await sendMessage(
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: `请为 requestId="${requestId}" 的讲解词生成语音。`
            }
          ]
        },
        { body: {} }
      );
    },
    [sendMessage]
  );



  // 1.7.3 输入框操作
  // （1）输入时，持续触发setState，改变agentInput的值，让输入框这个受控组件实时渲染改变内容
  const handleAgentInputChange = (
    // React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    // 表示该 onChange 事件可能来自 input 或 textarea
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  // （2）回车发送或者按钮发送时，把输入框setState为空，然后把拿到的agentInput调用sendMessage发给后端模型
  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

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



  // 1.7.4 其它部分：音频按按钮播放，并且停放其它音频
  const handleGuideAudioPlay = (
    event: React.SyntheticEvent<HTMLAudioElement>
  ) => {
    // 通过event当前的target拿到目前播放的音频
    const currentAudio = event.currentTarget;
    const allGuideAudios = document.querySelectorAll<HTMLAudioElement>(
      'audio[data-guide-audio="true"]'
    );
    // 遍历音频列表，如果不是当前音频就给它pause了
    allGuideAudios.forEach((audio) => {
      if (audio !== currentAudio && !audio.paused) {
        audio.pause();
      }
    });
  };

  

  // 1.8 副作用
  // 每次打开抽屉时拉取导览库音频列表：
  // 前端请求 /api/audio-list，后端按 browserSessionId 路由到对应实例，
  // 再由实例从 SQLite 读取并返回音频记录。
  useEffect(() => {
    if (isDrawerOpen) {
      fetch(`/api/audio-list?browserSessionId=${myBrowserSessionId}`)
        .then((res) => res.json())
        .then((data: any) => {
          // 拿到数据之后，用.map整理成标准格式，然后setState，这样react就拿state渲染列表
          const formattedItems = data.map((item: any) => ({
            id: item.id,
            spotName: item.spot_name,
            audioUrl: `/audio/${encodeURIComponent(item.object_key)}`
          }));
          setAudioItems(formattedItems);
        })
        .catch((e) => console.error("拉取导览库失败", e));
    }
  }, [isDrawerOpen, myBrowserSessionId]);

  
  // 自留，用来浏览器console看messages结构
  useEffect(() => {
    // 每次更新 messages 都打印，便于观察消息结构
    console.log("[agentMessages]", agentMessages);
  }, [agentMessages]);













  // 1.9 终于来到了JSX渲染的return部分！！！
  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <HasOpenAIKey />
      <AudioList
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        items={audioItems}
      />

      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
        {/* 1.9.1 顶部栏 */}
        <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 bg-red-100 dark:bg-[#66ccff] flex items-center gap-3 sticky top-0 z-10">
          <div className="flex items-center justify-center h-8 w-8">
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
            onClick={() => setIsDrawerOpen(true)}
          >
            <CassetteTapeIcon size={20} />
          </Button>
        </div>

        {/* 1.9.2 消息区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)] bg-blue-100">
          {agentMessages.length === 0 && (
            <div className="h-full items-center justify-center">
              <Card className="p-7 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
                <div className="text-center space-y-4">
                  <h3 className="font-semibold text-lg">你好！我是菠萝瑜</h3>
                  <p className="text-muted-foreground text-m text-left">
                    我是你的AI导游，目前支持伦敦地区的citywalk路线规划、基于伦敦500+景点RAG数据库的导览词一键生成、对应的音频一键生成；如果您不想局限在伦敦，也可以按照任意您提供的旅游路线和风格一键生成语音导览~
                  </p>
                  <ul className="text-left space-y-2">
                    <li className="flex items-center gap-4 text-m">
                      <span className="text-[#F48120]">•</span>
                      <span>例如，你可以尝试以下提示词来开始对话：</span>
                    </li>
                    <li className="flex items-center gap-4 text-sm ">
                      <span className="text-[#F48120]">•</span>
                      <span>
                        帮我规划一条从nutford house到 brick lane的步行路线，历史时期没有偏好，主题没有偏好。
                      </span>
                    </li>
                    <li className="flex items-center gap-4 text-sm ">
                      <span className="text-[#F48120]">•</span>
                      <span>
                        帮我规划一条从帕丁顿车站到伦敦眼的步行路线，历史时期是维多利亚时代，主题是历史和建筑。
                      </span>
                    </li>
                    <li className="flex items-center gap-4 text-sm ">
                      <span className="text-[#F48120]">•</span>
                      <span>
                        我正在参观大英博物馆，请你用英伦风老绅士的口吻，称呼我为“尊敬的小姐”，给我生成按照如下参观顺序的语音导览：罗塞塔石碑、拉美西斯二世雕像、帕特农神庙雕塑、复活节岛石像、路易斯西洋棋
                      </span>
                    </li>
                  </ul>
                </div>
              </Card>
            </div>
          )}

          {agentMessages.map((m, index) => {
            const isUser = m.role === "user";
            const showAvatar =
              index === 0 || agentMessages[index - 1]?.role !== m.role;

            return (
              <div key={m.id}>
                {showDebug && (
                  <pre className="text-xs text-muted-foreground overflow-scroll">
                    {JSON.stringify(m, null, 2)}
                  </pre>
                )}

                <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`flex gap-2 max-w-[85%] ${
                      isUser ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {showAvatar && !isUser ? (
                      <Avatar
                        username={"瑜"}
                        className="shrink-0"
                        tooltip={"我是瑜"}
                      />
                    ) : (
                      !isUser && <div className="w-8" />
                    )}

                    <div>
                      <div>
                        {m.parts?.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <div key={i}>
                                <Card
                                  className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                                    isUser
                                      ? "rounded-br-none"
                                      : "rounded-bl-none border-assistant-border"
                                  } ${
                                    part.text.startsWith("scheduled message")
                                      ? "border-accent/50"
                                      : ""
                                  } relative`}
                                >
                                  {part.text.startsWith("scheduled message") && (
                                    <span className="absolute -top-3 -left-2 text-base">
                                      🕒
                                    </span>
                                  )}

                                  <MemoizedMarkdown
                                    id={`${m.id}-${i}`}
                                    content={part.text.replace(
                                      /^scheduled message: /,
                                      ""
                                    )}
                                  />
                                </Card>

                                <p
                                  className={`text-xs text-muted-foreground mt-1 ${
                                    isUser ? "text-right" : "text-left"
                                  }`}
                                >
                                  {formatTime(
                                    m.metadata?.createdAt
                                      ? new Date(m.metadata.createdAt)
                                      : new Date()
                                  )}
                                </p>
                              </div>
                            );
                          }

                          if (isStaticToolUIPart(part) && m.role === "assistant") {
                            const toolCallId = part.toolCallId;
                            const toolName = part.type.replace("tool-", "");
                            const needsConfirmation =
                              toolsRequiringConfirmation.includes(
                                toolName as keyof typeof tools
                              );

                            const guideRequestId = GUIDE_TOOL_NAMES.has(toolName)
                              ? getGuideRequestIdFromToolOutput(part.output)
                              : undefined;
                            const requestCards = guideRequestId
                              ? guideCardsByRequest.get(guideRequestId)
                              : undefined;

                            const routeId =
                              toolName === "routePlan"
                                ? getRouteIdFromToolOutput(part.output)
                                : undefined;
                            const routeData = routeId
                              ? routeDataByRequest.get(routeId)
                              : undefined;

                            return (
                              <div
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

                                {GUIDE_TOOL_NAMES.has(toolName) &&
                                  requestCards &&
                                  requestCards.length > 0 && (
                                    <div className="space-y-2">
                                      {requestCards.map((card) => (
                                        <Card
                                          key={`${card.requestId}-${card.spotName}`}
                                          className="p-3 mb-1 rounded-md bg-neutral-100 dark:bg-neutral-900"
                                        >
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-sm">
                                              {card.spotName}
                                            </h4>
                                            <span className="text-xs text-muted-foreground">
                                              {guideStatusText[card.status]}
                                            </span>
                                          </div>

                                          {card.intro &&
                                            (() => {
                                              const cardKey =
                                                `${card.requestId}-${card.spotName}`;
                                              const isExpanded = expandedCards.has(cardKey);
                                              return (
                                                <div className="mb-2">
                                                  <p
                                                    className={`text-sm whitespace-pre-wrap ${
                                                      isExpanded ? "" : "line-clamp-6"
                                                    }`}
                                                  >
                                                    {card.intro}
                                                  </p>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      toggleCardExpand(cardKey)
                                                    }
                                                    className="mt-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                                                  >
                                                    {isExpanded
                                                      ? "收起 ▲"
                                                      : "展开全文 ▼"}
                                                  </button>
                                                </div>
                                              );
                                            })()}

                                          {card.audioUrl && (
                                            <audio
                                              controls
                                              src={card.audioUrl}
                                              className="w-full"
                                              data-guide-audio="true"
                                              onPlay={handleGuideAudioPlay}
                                            />
                                          )}

                                          {!card.audioUrl && card.status === "done" && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleGenerateAudio(card.requestId)
                                              }
                                              disabled={status === "streaming"}
                                              className="mt-1 text-xs px-3 py-1.5 rounded-md bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                              为该路线的所有地点生成语音 ▶
                                            </button>
                                          )}

                                          {!card.audioUrl &&
                                            (card.status === "pending" ||
                                              card.status === "processing") && (
                                              <p className="text-xs text-muted-foreground">
                                                音频生成中...
                                              </p>
                                            )}

                                          {!card.audioUrl && card.status === "done" && (
                                            <p className="text-xs text-muted-foreground">
                                              解说词已生成，目前尚无音频。
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

                                {toolName === "routePlan" && routeData && (
                                  <RouteCard
                                    data={routeData}
                                    onGenerateGuide={() =>
                                      handleGenerateRouteGuide(routeData)
                                    }
                                  />
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

        {/* 1.9.3 输入区 */}
        {/* 提交逻辑可以由 Enter 或按钮触发，最终都走 handleAgentSubmit，并提交状态变量 agentInput。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAgentSubmit(e, {
              annotations: {
                hello: "world"
              }
            });
            setTextareaHeight("auto");
          }}
          className="p-3 bg-neutral-50 absolute bottom-0 left-0 right-0 z-10 border-t border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Textarea
                // 当存在待确认工具调用时，输入区禁用，提示用户先处理确认
                disabled={pendingToolCallConfirmation}
                placeholder={
                  pendingToolCallConfirmation
                    ? "Please respond to the tool confirmation above..."
                    : "Send a message..."
                }
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2  ring-offset-background placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl text-base! pb-10 dark:bg-neutral-900"
                value={agentInput}
                onChange={(e) => {
                  handleAgentInputChange(e);
                  // 输入时自动增高文本框；发送后通过 setTextareaHeight("auto") 复位高度
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                  setTextareaHeight(`${e.target.scrollHeight}px`);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    // 输入法拼字阶段（如中文拼音未选词）不触发发送
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    handleAgentSubmit(e as unknown as React.FormEvent);
                    setTextareaHeight("auto");
                  }
                }}
                rows={2}
                style={{ height: textareaHeight }}
              />

              <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
                {status === "submitted" || status === "streaming" ? (
                  <button
                    type="button"
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

// 第三部分 OpenAI Key 校验提示
// 1. 顶层请求
const hasOpenAiKeyPromise = fetch("/check-open-ai-key").then((res) =>
  res.json<{ success: boolean }>()
);

// 2. 提示组件
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
