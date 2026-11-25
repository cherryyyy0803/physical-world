import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import bootstrapRoutes from './routes/bootstrap';
import judgeRoutes from './routes/judge';
import commandRoutes from './routes/command';
import chatRoutes from './routes/chat';
import challengeRoutes from './routes/challenge';

/**
 * 只负责「装配」，不负责「启动」。
 * 拆开是为了能在测试里 buildApp() 拿到实例直接 inject()，不用真占端口。
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  await app.register(cors, { origin: true });

  await app.register(bootstrapRoutes);
  await app.register(judgeRoutes);
  await app.register(commandRoutes);
  await app.register(chatRoutes);
  await app.register(challengeRoutes);

  return app;
}
