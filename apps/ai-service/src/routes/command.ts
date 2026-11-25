import type { FastifyInstance } from 'fastify';
import type { CommandRequest } from '@pw/contracts';
import { parseCommand } from '../ai/command';

/** 幂等表：同一 requestId 60 秒内只执行一次（PRD §6） */
const IDEMPOTENT_TTL = 60_000;

export default async function commandRoutes(app: FastifyInstance) {
  /** 表挂在插件实例上，不污染模块作用域，将来多实例/测试互不干扰 */
  const seen = new Map<string, { at: number; body: unknown }>();

  app.post<{ Body: CommandRequest }>('/api/command', async (req, reply) => {
    const body = req.body;
    if (!body?.text || !body.snapshot) {
      return reply.code(400).send({ message: '缺少 text 或 snapshot' });
    }

    const cacheKey = body.requestId;
    if (cacheKey) {
      const hit = seen.get(cacheKey);
      if (hit && Date.now() - hit.at < IDEMPOTENT_TTL) return hit.body;
    }

    const result = parseCommand(body);
    app.log.info(
      { text: body.text, ok: result.ok, ops: result.ops, source: result.source },
      'command',
    );

    if (cacheKey) {
      seen.set(cacheKey, { at: Date.now(), body: result });
      if (seen.size > 500) {
        const now = Date.now();
        for (const [k, v] of seen) {
          if (now - v.at > IDEMPOTENT_TTL) seen.delete(k);
        }
      }
    }
    return result;
  });
}
