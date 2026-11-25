import type { FastifyInstance } from 'fastify';
import type { JudgeRequest } from '@pw/contracts';
import { answerOf } from '../content-private/answers';

/**
 * 判题。答案只活在服务端，前端拿不到（PRD §6）。
 * 答对才给知识总结，答错只给方向性提示，避免「试错穷举」。
 */
export default async function judgeRoutes(app: FastifyInstance) {
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
}
