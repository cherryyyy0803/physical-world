import type { FastifyInstance } from 'fastify';
import { CHARACTERS, type ChatRequest, type ChatStreamEvent } from '@pw/contracts';
import { streamChat } from '../ai/llm';
import { buildSystemPrompt, mockReply } from '../ai/prompt';

/**
 * 聊天走 SSE 流式。非流式的话没有打字机效果，体验直接垮。
 * 模型失败不许假装成功：发 error 事件，前端据此提示重试（PRD §6）。
 */
export default async function chatRoutes(app: FastifyInstance) {
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
}
