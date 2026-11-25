import type { TaskPublic } from './contract';

/**
 * 平抛运动的三项基础任务（PRD 5.3）。
 * 这里只有题干和选项 —— 正确答案与解析放在 apps/server/src/data/answers.ts，
 * 不随题目下发到前端（PRD §6）。A 改题、C 核物理、B 判题。
 */
export const PROJECTILE_TASKS: TaskPublic[] = [
  {
    id: 'proj-v0-range',
    experimentId: 'projectile',
    title: '初速度与射程',
    goal: '保持高度和重力不变，改变初速度，观察落点距离怎么变。',
    hint: '保持高度和重力不变，试着把初速度调大一倍，注意看落点距离变成了原来的几倍。',
    question: {
      stem: '高度与重力都不变，把水平初速度增大到原来的 2 倍，水平射程会怎样变化？',
      options: ['变为原来的 2 倍', '变为原来的 4 倍', '保持不变', '变为原来的一半'],
    },
  },
  {
    id: 'proj-v0-time',
    experimentId: 'projectile',
    title: '初速度与落地时间',
    goal: '只改变初速度，观察小球在空中停留的时间有没有变化。',
    hint: '只动初速度，别的都不碰，盯着「飞行时间」这个数看它变不变。',
    question: {
      stem: '高度与重力不变，水平初速度增大一倍，落地时间怎样变化？',
      options: ['增大一倍', '减为一半', '不变'],
    },
  },
  {
    id: 'proj-h-time',
    experimentId: 'projectile',
    title: '高度与落地时间',
    goal: '保持重力不变，把下落高度变成 4 倍，观察落地时间怎么变。',
    hint: '把高度从 5 m 依次改成 10 m、20 m，每次记一下飞行时间，看看它和高度是不是成正比。',
    question: {
      stem: '重力不变，下落高度变为原来的 4 倍，落地时间变为原来的多少？',
      options: ['2 倍', '4 倍', '不变', '一半'],
    },
  },
];

export function tasksOfExperiment(experimentId: string): TaskPublic[] {
  return PROJECTILE_TASKS.filter((t) => t.experimentId === experimentId);
}
