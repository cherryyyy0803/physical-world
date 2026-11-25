import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_BY_EXPERIMENT,
  EXPERIMENTS,
  EXPERIMENT_LIST,
  SUBJECTS,
  tasksOfExperiment,
  type ChatRequest,
  type ChatStreamEvent,
  type ChallengeVerifyRequest,
  type CommandRequest,
  type JudgeRequest,
} from '@pw/shared';
import { PARAM_SPECS, verifyChallenge } from '@pw/core';
import { llmEnabled, streamChat } from './llm';
import { buildSystemPrompt, mockReply } from './prompt';
import { parseCommand } from './command';
import { answerOf } from './data/answers';
import { nextChallenge } from './data/challenges';

const PORT = Number(process.env.PORT ?? 8787);

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

await app.register(cors, { origin: true });

/* ─────────────── 启动数据：前端一次拿全 ─────────────── */

app.get('/api/bootstrap', async () => ({
  subjects: SUBJECTS,
  experiments: EXPERIMENT_LIST,
  experimentMap: EXPERIMENTS,
  characters: CHARACTERS,
  defaultCharacter: DEFAULT_CHARACTER_BY_EXPERIMENT,
  paramSpecs: PARAM_SPECS,
  llmEnabled: llmEnabled(),
}));

app.get('/api/health', async () => ({ ok: true, llmEnabled: llmEnabled() }));

app.get<{ Params: { experimentId: string } }>(
  '/api/tasks/:experimentId',
  async (req) => tasksOfExperiment(req.params.experimentId),
);

/* ─────────────── 判题：答案只在服务端 ─────────────── */

app.post<{ Body: JudgeRequest }>('/api/judge', async (req, reply) => {
  const { taskId, optionIndex } = req.body;
  const key = answerOf(taskId);
  if (!key) return reply.code(404).send({ message: `未知任务 ${taskId}` });
  const correct = optionIndex === key.index;
  return {
    correct,
    explain: key.explain,
    ...(correct ? { summary: key.summary } : {}),
  };
});

/* ─────────────── 自然语言调参 ─────────────── */

/** 幂等表：同一 requestId 60 秒内只执行一次（PRD §6） */
const seenCommands = new Map<string, { at: number; body: unknown }>();
const IDEMPOTENT_TTL = 60_000;

app.post<{ Body: CommandRequest }>('/api/command', async (req, reply) => {
  const body = req.body;
  if (!body?.text || !body.snapshot) {
    return reply.code(400).send({ message: '缺少 text 或 snapshot' });
  }

  const cacheKey = body.requestId;
  if (cacheKey) {
    const hit = seenCommands.get(cacheKey);
    if (hit && Date.now() - hit.at < IDEMPOTENT_TTL) return hit.body;
  }

  const result = parseCommand(body);
  app.log.info(
    { text: body.text, ok: result.ok, ops: result.ops, source: result.source },
    'command',
  );

  if (cacheKey) {
    seenCommands.set(cacheKey, { at: Date.now(), body: result });
    if (seenCommands.size > 500) {
      const now = Date.now();
      for (const [k, v] of seenCommands) {
        if (now - v.at > IDEMPOTENT_TTL) seenCommands.delete(k);
      }
    }
  }
  return result;
});

/* ─────────────── 聊天（SSE 流式） ─────────────── */

app.post<{ Body: ChatRequest }>('/api/chat', async (req, reply) => {
  const body = req.body;
  if (!body?.characterId || !Array.isArray(body.messages)) {
    return reply.code(400).send({ message: '缺少 characterId 或 messages' });
  }
  if (!CHARACTERS[body.characterId]) {
    return reply.code(404).send({ message: `未知人物 ${body.characterId}` });
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: ChatStreamEvent) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let aborted = false;
  // 注意：Node 16+ 里 req 的 'close' 在请求体读完时就触发，不能用它判断断连；
  // 要盯响应对象，客户端真的断了才会关。
  reply.raw.on('close', () => {
    aborted = true;
  });

  let full = '';
  try {
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(body) },
      ...body.messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    ];

    for await (const delta of streamChat(messages, { fallback: mockReply(body) })) {
      if (aborted) break;
      full += delta;
      send({ type: 'delta', text: delta });
    }

    if (!aborted) send({ type: 'done', full });
  } catch (err) {
    const message = err instanceof Error ? err.message : '模型调用失败';
    app.log.error({ err }, 'chat failed');
    if (!aborted) send({ type: 'error', message });
  } finally {
    reply.raw.end();
  }
});

/* ─────────────── 挑战 ─────────────── */

app.post<{ Body: { doneChallengeIds?: string[] } }>(
  '/api/challenge/generate',
  async (req) => {
    const challenge = nextChallenge(req.body?.doneChallengeIds ?? []);
    return challenge;
  },
);

app.post<{ Body: ChallengeVerifyRequest }>('/api/challenge/verify', async (req, reply) => {
  const { challenge, params } = req.body ?? {};
  if (!challenge || !params) return reply.code(400).send({ message: '缺少 challenge 或 params' });
  return verifyChallenge({ challenge, params });
});

/* ─────────────── 启动 ─────────────── */

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(
    llmEnabled()
      ? '模型已配置，走真实调用'
      : '未配置 LLM_API_KEY，进入演示模式（返回预置话术）',
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
