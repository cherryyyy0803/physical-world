import type { ExperimentResult, ParamSpec, ParamValues } from '@pw/shared';

/**
 * 平抛运动 —— 首版唯一需要完整实现的实验（PRD 5.10）。
 *
 * 约定（全项目统一，不允许各端各写一套）：
 *   统一向上为正，地面 y = 0，忽略空气阻力。
 *   x  = v₀ t
 *   y  = h − ½ g t²
 *   vx = v₀ ,  vy = −g t
 *   T  = √(2h/g)   ,  L = v₀ T
 */

export interface ProjectileParams {
  /** 初速度 m/s */
  v0: number;
  /** 抛出高度 m */
  h: number;
  /** 重力加速度 m/s² */
  g: number;
}

/** 参数范围由 C 唯一维护，B 与 A 只读取（PRD 5.10） */
export const PROJECTILE_PARAMS: ParamSpec[] = [
  {
    key: 'v0',
    label: '初速度',
    unit: 'm/s',
    min: 1,
    max: 50,
    step: 0.5,
    default: 10,
    hint: '小球被水平抛出时的速度',
  },
  {
    key: 'h',
    label: '抛出高度',
    unit: 'm',
    min: 1,
    max: 100,
    step: 0.5,
    default: 20,
    hint: '抛出点离地面的高度',
  },
  {
    key: 'g',
    label: '重力加速度',
    unit: 'm/s²',
    min: 1.6,
    max: 20,
    step: 0.1,
    default: 9.8,
    hint: '地球约为 9.8，月球约为 1.6',
  },
];

export const PROJECTILE_DEFAULTS: ProjectileParams = {
  v0: 10,
  h: 20,
  g: 9.8,
};

export class ParamOutOfRangeError extends Error {
  constructor(
    readonly key: string,
    readonly value: number,
    readonly spec: ParamSpec,
  ) {
    super(
      `${spec.label}取 ${value}${spec.unit} 超出允许范围（${spec.min}–${spec.max}${spec.unit}）`,
    );
    this.name = 'ParamOutOfRangeError';
  }
}

/** 四舍五入到指定小数位，避免 1.0000000000002 这种显示问题 */
export function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function specOf(key: string): ParamSpec {
  const spec = PROJECTILE_PARAMS.find((s) => s.key === key);
  if (!spec) throw new Error(`未知参数 ${key}`);
  return spec;
}

/** 把任意数值夹到合法范围内，UI 拖动条用 */
export function clampParam(key: string, value: number): number {
  const spec = specOf(key);
  if (!Number.isFinite(value)) return spec.default;
  return Math.min(spec.max, Math.max(spec.min, value));
}

/** 参数校验。越界直接抛错，绝不静默改成别的数值（PRD 5.5） */
export function assertProjectileParams(params: ProjectileParams): void {
  for (const spec of PROJECTILE_PARAMS) {
    const value = params[spec.key as keyof ProjectileParams];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ParamOutOfRangeError(spec.key, Number.NaN, spec);
    }
    if (value < spec.min || value > spec.max) {
      throw new ParamOutOfRangeError(spec.key, value, spec);
    }
  }
}

export function toProjectileParams(values: ParamValues): ProjectileParams {
  return {
    v0: values.v0 ?? PROJECTILE_DEFAULTS.v0,
    h: values.h ?? PROJECTILE_DEFAULTS.h,
    g: values.g ?? PROJECTILE_DEFAULTS.g,
  };
}

/** 落地时间 T = √(2h/g) */
export function flightTime(p: ProjectileParams): number {
  return Math.sqrt((2 * p.h) / p.g);
}

/** 水平射程 L = v₀T */
export function range(p: ProjectileParams): number {
  return p.v0 * flightTime(p);
}

/** 落地瞬间的速度大小 */
export function landingSpeed(p: ProjectileParams): number {
  return Math.hypot(p.v0, p.g * flightTime(p));
}

/** 落地速度与水平方向的夹角（度，向下为正） */
export function landingAngleDeg(p: ProjectileParams): number {
  return (Math.atan2(p.g * flightTime(p), p.v0) * 180) / Math.PI;
}

export interface ProjectileSample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 是否已落地（落地后数据冻结，不穿地） */
  landed: boolean;
}

/**
 * 取 t 时刻的运动状态。t 超过落地时间自动夹到 T，
 * 保证「落地停止、不穿地」（PRD 5.10）。
 */
export function sampleAt(p: ProjectileParams, t: number): ProjectileSample {
  assertProjectileParams(p);
  const T = flightTime(p);
  const clamped = Math.min(Math.max(t, 0), T);
  return {
    t: round(clamped, 4),
    x: round(p.v0 * clamped, 4),
    y: round(Math.max(0, p.h - 0.5 * p.g * clamped * clamped), 4),
    vx: round(p.v0, 4),
    vy: round(-p.g * clamped, 4),
    landed: t >= T,
  };
}

/** 计算引擎的对外输出：画面、AI 解释、挑战判定读的都是它 */
export function computeProjectileResult(p: ProjectileParams): ExperimentResult {
  assertProjectileParams(p);
  const T = flightTime(p);
  return {
    flightTime: round(T, 4),
    range: round(range(p), 4),
    landed: false,
    metrics: {
      landingSpeed: round(landingSpeed(p), 3),
      landingAngle: round(landingAngleDeg(p), 2),
      v0: round(p.v0, 3),
      h: round(p.h, 3),
      g: round(p.g, 3),
    },
  };
}

/**
 * 生成整条轨迹采样点，供画布绘制轨迹用。
 * steps 越大越平滑；默认 120 点足够 60fps 下的视觉需求。
 */
export function trajectory(p: ProjectileParams, steps = 120): ProjectileSample[] {
  assertProjectileParams(p);
  const T = flightTime(p);
  const out: ProjectileSample[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(sampleAt(p, (T * i) / steps));
  }
  return out;
}
