const normalizeTextForFasterTts = (text: string) => {
  return text
    .replace(/\s+/g, " ") // 多个连续空白（换行/Tab/多空格）→ 单个空格
    .replace(/[""''"']/g, "") // 删除所有引号（""''""'）
    .replace(/[。！？!?；;：:]/g, "，") // 句末强停顿标点 → 逗号，减少 TTS 停顿感，加快语速
    .replace(/[（(][^)）]*[)）]/g, "") // 删除括号及其内容，如 (注释)（备注）
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9，,。.!?！？；;：:\-—\s]/g, "") // 删除白名单外的字符（emoji、#*~@ 等特殊符号）
    .replace(/，{2,}/g, "，") // 合并连续逗号（上一步替换可能产生多个相邻逗号）
    .trim();
};

// 第二个函数，把文本切成小于110字的小段，以保证TTS api可以转语音。方法是把文本按照标点符号切片做成数组，然后拼，每拼到110字就放segments里
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

// 向 Google TTS API 发请求，获取一段文字的音频数据（MP3 字节）。此函数接受一个chunk作为参数，把它发给谷歌，返回该chunk的音频流。
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

// 此函数是以上三个函数的合体版，接受text、用函数1洗好、用函数2拆好、for循环地把拆好的每一段110字chunk喂给函数3得到每一段的bytes然后push进buffers，最后这个函数自己的功能就是把buffers给拼起来变成完整音频流。
export const synthesizeTtsWithFallback = async (
  text: string
): Promise<Uint8Array> => {
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

  console.log("[TTS] provider=google-fast-normalized");
  return new Uint8Array(merged);
};

// 给每个文本生成一个独一无二的哈希值，用来做音频缓存的 key——把 TTS 文本哈希一下，用哈希值当文件名存储，下次碰到同样的文本就直接返回缓存，不用再调 API。输入任意文本 → 输出固定长度的 64 字符十六进制字符串，相同输入永远得到相同输出，不同输入几乎不可能得到相同输出
export const hashText = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function getWikiSummary(
  spot: string,
  language: string = "zh"
): Promise<string | null> {
  const safeSpot = encodeURIComponent(spot);
  // const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${safeSpot}`
  const url = `https://${language}.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${safeSpot}&format=json&explaintext=true`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "MyAwesomeWikiApp/1.0 (contact@example.com)",
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`${spot}在wiki上没有介绍`);
        return "无介绍";
      }
      throw new Error(
        `HTTP Error: ${response.status} - ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;

    const pages = data.query.pages as any;

    const pageData = Object.values(pages)[0] as any;

    return `${pageData.extract}`;
  } catch (error) {
    console.error("请求维基百科时发生网络或解析错误:", error);
    return null;
  }
}
