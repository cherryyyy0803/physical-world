/**
 * 选择题标准答案与解析 —— 只活在后端，不下发到前端（PRD §6）。
 * A 编写，C 核对物理，B 负责判定。
 */
export interface AnswerKey {
  /** 正确选项的下标 */
  index: number;
  /** 答错时给的简短提示 */
  explain: string;
  /** 答对后补上的知识规律 */
  summary: string;
}

export const ANSWERS: Record<string, AnswerKey> = {
  'proj-v0-range': {
    index: 0,
    explain:
      '落地时间只由高度和重力加速度决定，初速度变了它也不变；射程等于初速度乘以落地时间，所以射程和初速度成正比。',
    summary: 'L = v₀T，T = √(2h/g)。水平方向上小球做匀速运动，射程与初速度成正比。',
  },
  'proj-v0-time': {
    index: 2,
    explain:
      '水平方向和竖直方向互不影响。竖直方向上是自由落体，只由高度和重力加速度决定落地时间，与水平初速度无关。',
    summary: '落地时间 T = √(2h/g)，与 v₀ 无关。初速度只改变落点远近，不改变滞空时间。',
  },
  'proj-h-time': {
    index: 0,
    explain:
      '由 T = √(2h/g) 可以看出，T 与 √h 成正比。高度变成 4 倍，√4 = 2，所以落地时间变为原来的 2 倍。',
    summary: 'T ∝ √h：高度变为 n 倍，落地时间变为 √n 倍。',
  },
};

export function answerOf(taskId: string): AnswerKey | undefined {
  return ANSWERS[taskId];
}
