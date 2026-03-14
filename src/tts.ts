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

export const synthesizeTtsWithFallback = async (
  text: string
): Promise<Uint8Array> => {
  const googleAudio = await synthesizeGoogleTts(text);
  console.log("[TTS] provider=google-fast-normalized");
  return googleAudio;
};

export const hashText = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
