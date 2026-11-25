import './env.js'; // 必须放在最前面：.env 要在读 process.env 的模块之前加载

import { buildApp } from './app';
import { llmEnabled } from './ai/llm';

const PORT = Number(process.env.PORT ?? 8787);

const app = await buildApp();

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
