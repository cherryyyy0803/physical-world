import { isChallengeSolvable } from '@pw/core';
import type { ChallengeSpec } from '@pw/shared';

/**
 * 挑战模板（PRD 5.7）。
 * 模板由 A 提供教学目标，B 用 C 的规则跑可解性检查，不可解的模板直接不展示。
 * 固定条件里 h 和 g 都锁死，否则学生可以靠改 g「作弊」通关。
 */
export const CHALLENGE_TEMPLATES: ChallengeSpec[] = [
  {
    id: 'proj-hit-30m',
    title: '精确命中',
    goal: '让小球落点到达 30 m 附近',
    fixedDesc: '抛出高度保持 20 m，重力加速度保持 9.8 m/s²',
    fixed: { h: 20, g: 9.8 },
    editable: ['v0'],
    target: { key: 'range', label: '落点', min: 29.5, max: 30.5, unit: 'm' },
  },
  {
    id: 'proj-high-drop',
    title: '高台投送',
    goal: '从 45 m 高处让小球落在 20 m 外的目标区',
    fixedDesc: '抛出高度保持 45 m，重力加速度保持 9.8 m/s²',
    fixed: { h: 45, g: 9.8 },
    editable: ['v0'],
    target: { key: 'range', label: '落点', min: 19.5, max: 20.5, unit: 'm' },
  },
  {
    id: 'proj-moon',
    title: '月球上的抛球',
    goal: '在月球重力下让小球落在 40 m 外',
    fixedDesc: '抛出高度保持 20 m，重力加速度锁定为月球的 1.6 m/s²',
    fixed: { h: 20, g: 1.6 },
    editable: ['v0'],
    target: { key: 'range', label: '落点', min: 39.5, max: 40.5, unit: 'm' },
  },
];

/** 只返回通过可解性检查的模板 */
export function solvableChallenges(): ChallengeSpec[] {
  return CHALLENGE_TEMPLATES.filter((c) => isChallengeSolvable(c).ok);
}

/** 优先给还没通过的那一关，全过了就轮着来 */
export function nextChallenge(doneIds: string[] = []): ChallengeSpec {
  const pool = solvableChallenges();
  const fresh = pool.find((c) => !doneIds.includes(c.id));
  return fresh ?? pool[0]!;
}
