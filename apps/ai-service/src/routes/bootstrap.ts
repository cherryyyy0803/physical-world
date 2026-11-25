import type { FastifyInstance } from 'fastify';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_BY_EXPERIMENT,
  EXPERIMENTS,
  EXPERIMENT_LIST,
  SUBJECTS,
  tasksOfExperiment,
} from '@pw/contracts';
import { PARAM_SPECS } from '@pw/physics-core';
import { llmEnabled } from '../ai/llm';

/**
 * 启动数据：前端一次拿全，避免进页面连打四五个请求。
 * 注意这里只下发「元数据」，题目答案、挑战判定规则都不在里面。
 */
export default async function bootstrapRoutes(app: FastifyInstance) {
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
}
