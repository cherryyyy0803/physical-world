import type {
  ControlOp,
  ExperimentId,
  ExperimentResult,
  ParamSpec,
  ParamValues,
} from '@pw/contracts';
import { PROJECTILE_PARAMS, computeProjectileResult, toProjectileParams } from './projectile';

/**
 * 实验注册表。新增实验（弹簧振子 / 双缝干涉）时只在这里挂一个实现，
 * 上层的 A 与 B 不需要改任何逻辑。
 */
export const PARAM_SPECS: Partial<Record<ExperimentId, ParamSpec[]>> = {
  projectile: PROJECTILE_PARAMS,
  // spring: SPRING_PARAMS,        ← 第二个实验从这里接入
  // 'double-slit': SLIT_PARAMS,
};

export class ExperimentNotAvailableError extends Error {
  constructor(readonly experimentId: ExperimentId) {
    super(`实验 ${experimentId} 尚未上线`);
    this.name = 'ExperimentNotAvailableError';
  }
}

/** 参数定义。未上线的实验返回空数组，前端据此显示「后续开放」 */
export function paramsOf(experimentId: ExperimentId): ParamSpec[] {
  return PARAM_SPECS[experimentId] ?? [];
}

export function defaultsOf(experimentId: ExperimentId): ParamValues {
  const out: ParamValues = {};
  for (const spec of paramsOf(experimentId)) out[spec.key] = spec.default;
  return out;
}

export function isAvailable(experimentId: ExperimentId): boolean {
  return paramsOf(experimentId).length > 0;
}

/**
 * 把一组原子操作作用到参数上，返回新参数。
 * 手动拖动、点击按钮、AI 指令走的都是这个函数 —— 保证三者改的是同一套状态（PRD 5.5）。
 */
export function applyOps(params: ParamValues, ops: ControlOp[]): ParamValues {
  const next: ParamValues = { ...params };
  for (const op of ops) {
    if (op.type === 'setParam') next[op.key] = op.value;
  }
  return next;
}

/** 统一的物理计算入口 */
export function compute(experimentId: ExperimentId, params: ParamValues): ExperimentResult {
  switch (experimentId) {
    case 'projectile':
      return computeProjectileResult(toProjectileParams(params));
    default:
      throw new ExperimentNotAvailableError(experimentId);
  }
}
