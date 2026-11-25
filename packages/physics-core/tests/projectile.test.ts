import { describe, expect, it } from 'vitest';
import {
  PROJECTILE_DEFAULTS,
  ParamOutOfRangeError,
  clampParam,
  computeProjectileResult,
  flightTime,
  landingSpeed,
  range,
  sampleAt,
} from '../src/projectile';
import { verifyChallenge } from '../src/challenge';
import type { ChallengeSpec } from '@pw/contracts';

/**
 * 物理测试样例（C 的交付物之一，PRD 2 / 7）。
 * 每条断言都对应 PRD 5.3 的任务结论或 5.10 的正确性要求。
 */

const EPS = 1e-6;

describe('平抛运动基本公式（PRD 5.10）', () => {
  it('T = √(2h/g)，h=20 g=9.8 时约为 2.0203 s', () => {
    expect(flightTime({ v0: 10, h: 20, g: 9.8 })).toBeCloseTo(2.0203, 3);
  });

  it('T = √(2h/g)，h=20 g=10 时正好 2 s', () => {
    expect(flightTime({ v0: 15, h: 20, g: 10 })).toBeCloseTo(2, 6);
  });

  it('L = v₀T，v₀=15 h=20 g=10 时射程 30 m', () => {
    expect(range({ v0: 15, h: 20, g: 10 })).toBeCloseTo(30, 6);
  });

  it('落地速度大小满足 v = √(v₀² + 2gh)', () => {
    const p = { v0: 12, h: 45, g: 9.8 };
    expect(landingSpeed(p)).toBeCloseTo(Math.sqrt(12 ** 2 + 2 * 9.8 * 45), 6);
  });

  it('落地时刻 y 回到 0', () => {
    const p = { v0: 10, h: 20, g: 9.8 };
    expect(sampleAt(p, flightTime(p)).y).toBeCloseTo(0, 3);
  });
});

describe('三项基础任务的知识点（PRD 5.3）', () => {
  const base = { v0: 10, h: 20, g: 9.8 };

  it('任务①：高度与 g 不变，初速度加倍 → 射程加倍', () => {
    const doubled = range({ ...base, v0: base.v0 * 2 });
    expect(doubled).toBeCloseTo(range(base) * 2, 6);
  });

  it('任务②：高度与 g 不变，初速度加倍 → 落地时间不变', () => {
    const doubled = flightTime({ ...base, v0: base.v0 * 2 });
    expect(doubled).toBeCloseTo(flightTime(base), 10);
  });

  it('任务③：g 不变，高度变为 4 倍 → 落地时间为 2 倍', () => {
    const four = flightTime({ ...base, h: base.h * 4 });
    expect(four).toBeCloseTo(flightTime(base) * 2, 6);
  });
});

describe('落地与边界行为（PRD 5.10）', () => {
  const p = { v0: 10, h: 20, g: 9.8 };
  const T = flightTime(p);

  it('落地后时间被夹住，不继续下落、不穿地', () => {
    const s = sampleAt(p, T + 5);
    expect(s.y).toBe(0);
    expect(s.landed).toBe(true);
    expect(s.x).toBeCloseTo(range(p), 4);
  });

  it('t 为负时夹到 0，位置在抛出点', () => {
    const s = sampleAt(p, -1);
    expect(s.x).toBe(0);
    expect(s.y).toBeCloseTo(p.h, 6);
  });

  it('竖直分速度随时间线性增大（向下为负）', () => {
    expect(sampleAt(p, 0).vy).toBeCloseTo(0, 6);
    expect(sampleAt(p, 1).vy).toBeCloseTo(-9.8, 6);
    expect(sampleAt(p, T).vy).toBeCloseTo(-9.8 * T, 4);
  });

  it('越界参数直接抛错，不静默改值', () => {
    expect(() => computeProjectileResult({ v0: 999, h: 20, g: 9.8 })).toThrow(
      ParamOutOfRangeError,
    );
    expect(() => computeProjectileResult({ v0: 10, h: 0, g: 9.8 })).toThrow(
      ParamOutOfRangeError,
    );
    expect(() => computeProjectileResult({ v0: 10, h: 20, g: Number.NaN })).toThrow(
      ParamOutOfRangeError,
    );
  });

  it('clampParam 把越界值夹回合法范围', () => {
    expect(clampParam('v0', 999)).toBe(50);
    expect(clampParam('v0', -3)).toBe(1);
    expect(clampParam('v0', 12.5)).toBe(12.5);
  });

  it('默认参数可计算，且结果自洽', () => {
    const r = computeProjectileResult(PROJECTILE_DEFAULTS);
    expect(r.landed).toBe(false);
    expect(r.range).toBeGreaterThan(0);
    expect(r.metrics.landingAngle).toBeGreaterThan(0);
    expect(r.metrics.landingAngle).toBeLessThan(90);
  });
});

describe('挑战判定（PRD 5.7）', () => {
  const challenge: ChallengeSpec = {
    id: 'proj-hit-30m',
    title: '精确命中',
    goal: '让落点到达 30 m',
    fixedDesc: '高度保持 20 m',
    fixed: { h: 20 },
    editable: ['v0'],
    target: { key: 'range', label: '落点', min: 29.5, max: 30.5, unit: 'm' },
  };

  it('v₀ = 15 m/s（g 取 9.8）落点约 30.3 m，判为通过', () => {
    const r = verifyChallenge({ challenge, params: { v0: 15, h: 20, g: 9.8 } });
    expect(r.pass).toBe(true);
    expect(r.actual).toBeCloseTo(30.3, 1);
  });

  it('v₀ 太小判为失败，并提示往哪个方向调', () => {
    const r = verifyChallenge({ challenge, params: { v0: 8, h: 20, g: 9.8 } });
    expect(r.pass).toBe(false);
    expect(r.message).toContain('调大');
  });

  it('动过固定条件直接判失败', () => {
    const r = verifyChallenge({ challenge, params: { v0: 15, h: 40, g: 9.8 } });
    expect(r.pass).toBe(false);
    expect(r.message).toContain('固定条件');
  });

  it('容差区间边界：29.5 m 与 30.5 m 都算通过', () => {
    // 反解 v0 = L / T
    const T = flightTime({ v0: 1, h: 20, g: 9.8 });
    for (const L of [29.5, 30.5]) {
      const r = verifyChallenge({ challenge, params: { v0: L / T, h: 20, g: 9.8 } });
      expect(r.pass, `落点 ${L} 应通过`).toBe(true);
      expect(Math.abs(range({ v0: L / T, h: 20, g: 9.8 }) - L)).toBeLessThan(EPS * 10);
    }
  });
});
