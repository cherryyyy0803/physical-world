/**
 * 环境变量加载。必须在任何读取 process.env 的模块之前 import。
 *
 * 从 apps/server 起服务时，.env 放在仓库根目录；从仓库根目录起时，.env 就在当前目录。
 * 两个位置都试一下，谁先读到用谁。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    // 格式有问题就跳过，让服务继续用系统环境变量起来
  }
}
