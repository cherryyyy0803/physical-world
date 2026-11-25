import type { FastifyInstance } from 'fastify';
import type { ChallengeVerifyRequest } from '@pw/contracts';
import { verifyChallenge } from '@pw/physics-core';
import { nextChallenge } from '../content-private/challenges';

/**
 * 挑战：生成与判定分开。
 * 判定必须用物理引擎真算，不能靠前端上报的结果——不然改一下 devtools 就通关了。
 */
export default async function challengeRoutes(app: FastifyInstance) {
  app.post<{ Body: { doneChallengeIds?: string[] } }>(
    '/api/challenge/generate',
    async (req) => nextChallenge(req.body?.doneChallengeIds ?? []),
  );

  app.post<{ Body: ChallengeVerifyRequest }>('/api/challenge/verify', async (req, reply) => {
    const { challenge, params } = req.body ?? {};
    if (!challenge || !params) {
      return reply.code(400).send({ message: '缺少 challenge 或 params' });
    }
    return verifyChallenge({ challenge, params });
  });
}
