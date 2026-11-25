/**
 * 模型适配层。任何 OpenAI 兼容接口都能接（DeepSeek / 通义 / 智谱 / 硅基流动 / 本地 vLLM）。
 * 只改环境变量，不动代码。
 *
 * 没有配 key 时进入 mock 模式：流式吐出一段预置文本，
 * 让 A 在没有模型的情况下也能把前端联调完（PRD §6「模型失败不阻断」）。
 */

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1';
const API_KEY = process.env.LLM_API_KEY ?? '';
const MODEL = process.env.LLM_MODEL ?? 'deepseek-chat';

export const llmEnabled = (): boolean => API_KEY.trim().length > 0;

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MOCK_DELAY_MS = 28;

async function* mockStream(text: string): AsyncGenerator<string> {
  const chars = Array.from(text);
  for (const ch of chars) {
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
    yield ch;
  }
}

/** 流式对话。yield 出来的是增量文本。 */
export async function* streamChat(
  messages: LlmMessage[],
  opts: { fallback?: string; temperature?: number; maxTokens?: number } = {},
): AsyncGenerator<string> {
  if (!llmEnabled()) {
    yield* mockStream(
      opts.fallback ??
        '（当前是演示模式，还没有配置模型密钥，所以我只能先说这么多。配置 LLM_API_KEY 之后我就能真的和你讨论了。）',
    );
    return;
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`模型接口返回 ${res.status}：${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 半包 JSON，丢弃等下一轮
      }
    }
  }
}

/** 一次性取完整文本，用于指令解析这类需要结构化输出的场景 */
export async function completeText(
  messages: LlmMessage[],
  opts: { temperature?: number; json?: boolean } = {},
): Promise<string> {
  if (!llmEnabled()) throw new Error('LLM_NOT_CONFIGURED');

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      temperature: opts.temperature ?? 0,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`模型接口返回 ${res.status}：${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? '';
}
