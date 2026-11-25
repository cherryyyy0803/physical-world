import type {
  ChallengeSpec,
  ChallengeVerifyResponse,
  Character,
  CharacterId,
  ChatRequest,
  CommandRequest,
  CommandResponse,
  ExperimentId,
  ExperimentMeta,
  JudgeResponse,
  ParamSpec,
  Subject,
  TaskPublic,
} from '@pw/shared';

export interface Bootstrap {
  subjects: Subject[];
  experiments: ExperimentMeta[];
  experimentMap: Record<ExperimentId, ExperimentMeta>;
  characters: Record<CharacterId, Character>;
  defaultCharacter: Record<ExperimentId, CharacterId>;
  paramSpecs: Partial<Record<ExperimentId, ParamSpec[]>>;
  llmEnabled: boolean;
}

const BASE = '/api';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const getBootstrap = () => json<Bootstrap>('/bootstrap');

export const getTasks = (experimentId: ExperimentId) =>
  json<TaskPublic[]>(`/tasks/${experimentId}`);

export const judgeTask = (taskId: string, optionIndex: number) =>
  json<JudgeResponse>('/judge', {
    method: 'POST',
    body: JSON.stringify({ taskId, optionIndex }),
  });

export const generateChallenge = (doneChallengeIds: string[] = []) =>
  json<ChallengeSpec>('/challenge/generate', {
    method: 'POST',
    body: JSON.stringify({ doneChallengeIds }),
  });

export const verifyChallengeRequest = (challenge: ChallengeSpec, params: Record<string, number>) =>
  json<ChallengeVerifyResponse>('/challenge/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge, params }),
  });

export const parseCommandRequest = (body: CommandRequest) =>
  json<CommandResponse>('/command', {
    method: 'POST',
    body: JSON.stringify(body),
  });

/**
 * 聊天：SSE 流式。逐字回调 onDelta，返回完整文本。
 * 中途出错抛异常，由调用方显示「失败可重试」（PRD §6）。
 */
export async function streamChatRequest(
  body: ChatRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) throw new Error(`聊天接口返回 ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      const event = JSON.parse(payload) as
        | { type: 'delta'; text: string }
        | { type: 'done'; full: string }
        | { type: 'error'; message: string };

      if (event.type === 'delta') {
        full += event.text;
        onDelta(event.text);
      } else if (event.type === 'error') {
        throw new Error(event.message);
      } else if (event.type === 'done') {
        return event.full;
      }
    }
  }
  return full;
}
