import type { ChallengeSpec, ChallengeVerifyRequest, ChallengeVerifyResponse } from '@pw/shared';
import {
  PROJECTILE_PARAMS,
  computeProjectileResult,
  flightTime,
  round,
  toProjectileParams,
} from './projectile';

const EPS = 1e-6;

function labelOf(key: string): string {
  return PROJECTILE_PARAMS.find((s) => s.key === key)?.label ?? key;
}

function unitOf(key: string): string {
  return PROJECTILE_PARAMS.find((s) => s.key === key)?.unit ?? '';
}

/**
 * 挑战判定 —— 由程序算，不由 AI 判（PRD 5.7 / 5.5）。
 * 学生提交后：先看固定条件有没有被动过，再算实际落点，最后看是否落在容差区间内。
 */
export function verifyChallenge(req: ChallengeVerifyRequest): ChallengeVerifyResponse {
  const { challenge, params } = req;

  for (const [key, fixedValue] of Object.entries(challenge.fixed)) {
    const actualValue = params[key];
    if (actualValue === undefined) continue;
    if (Math.abs(actualValue - fixedValue) > EPS) {
      return {
        pass: false,
        actual: Number.NaN,
        message: `「${labelOf(key)}」是这一关的固定条件，不能改动（需要保持 ${fixedValue}${unitOf(key)}）。`,
      };
    }
  }

  const result = computeProjectileResult(toProjectileParams(params));
  const actual = result.range;
  const { min, max, label, unit } = challenge.target;

  if (actual >= min && actual <= max) {
    return {
      pass: true,
      actual,
      message: `落点 ${round(actual, 2)}${unit}，落在 ${min}–${max}${unit} 之内，挑战完成。`,
    };
  }

  const diff = actual < min ? min - actual : actual - max;
  const direction = actual < min ? '把初速度再调大一些' : '把初速度调小一些';
  return {
    pass: false,
    actual,
    message: `落点 ${round(actual, 2)}${unit}，离目标区间 ${round(diff, 2)}${unit}，${direction}再试一次。`,
  };
}

/**
 * 可解性检查 —— 生成的挑战必须先过这一关才能展示给学生（PRD 5.7）。
 * 原理：固定参数定死后，可改参数的合法范围映射成一个可达区间，
 * 目标区间只要和可达区间有交集就一定有解。
 */
export function isChallengeSolvable(challenge: ChallengeSpec): {
  ok: boolean;
  reason?: string;
} {
  const editable = challenge.editable;
  if (editable.length !== 1 || editable[0] !== 'v0') {
    return { ok: false, reason: '当前只支持单一可改参数 v0 的挑战模板' };
  }

  const v0Spec = PROJECTILE_PARAMS.find((s) => s.key === 'v0');
  if (!v0Spec) return { ok: false, reason: '缺少 v0 参数定义' };

  const base = toProjectileParams({
    v0: v0Spec.default,
    h: challenge.fixed.h ?? 20,
    g: challenge.fixed.g ?? 9.8,
  });
  if (base.h < 1 || base.g < 1.6) {
    return { ok: false, reason: '固定条件中的高度或重力加速度不在合法范围内' };
  }

  const T = flightTime(base);
  const reachableMin = v0Spec.min * T;
  const reachableMax = v0Spec.max * T;
  const target = challenge.target;

  if (target.max < reachableMin || target.min > reachableMax) {
    return {
      ok: false,
      reason: `目标落点 ${target.min}–${target.max}${target.unit} 在可调范围内无法达到（可达区间约 ${round(reachableMin, 1)}–${round(reachableMax, 1)}${target.unit}）`,
    };
  }
  return { ok: true };
}

/** 反解出标准解，只在服务端保留，不下发给前端（PRD §6） */
export function solveChallenge(challenge: ChallengeSpec): number | null {
  const fixedH = challenge.fixed.h;
  const fixedG = challenge.fixed.g;
  if (fixedH === undefined || fixedG === undefined) return null;
  const T = flightTime({ v0: 1, h: fixedH, g: fixedG });
  const mid = (challenge.target.min + challenge.target.max) / 2;
  return round(mid / T, 3);
}
