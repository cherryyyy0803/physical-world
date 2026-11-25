/**
 * @pw/contracts — 三端共用的接口契约
 *
 * 这份文件是 PRD 4.2「B 与 C 先约定的接口」的代码化版本。
 * 改字段 = 改契约，三人必须在群里同步后再改。
 */

/* ───────────────────────── 基础标识 ───────────────────────── */

export type ExperimentId = 'projectile' | 'spring' | 'double-slit';

export type CharacterId = 'galileo' | 'hooke' | 'young';

/** 三档回答难度：通俗 / 正常 / 专业 */
export type AnswerLevel = 'plain' | 'normal' | 'expert';

/** 右下角人物面板的四个菜单项（严格四项，PRD 5.4） */
export type PartnerFeature = 'chat' | 'suggest' | 'challenge' | 'review';

/* ───────────────────────── 参数与状态 ───────────────────────── */

export type ParamValues = Record<string, number>;

/** 参数定义由 C 统一配置，B 与 A 只读取，不各自维护一套（PRD 5.10） */
export interface ParamSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** 该参数对用户意味着什么，给 AI 组 prompt 用 */
  hint?: string;
}

export type RunState = 'idle' | 'running' | 'paused' | 'landed';

/** 一次操作。手动调参和自然语言调参走同一套（PRD 5.5） */
export type ControlOp =
  | { type: 'setParam'; key: string; value: number }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' };

/** 计算引擎产出的结果。画面、AI 解释、挑战判定读的都是它（PRD 5.10） */
export interface ExperimentResult {
  /** 特征时间（平抛为落地时间）单位 s */
  flightTime: number;
  /** 特征长度（平抛为水平射程）单位 m */
  range: number;
  landed: boolean;
  /** 其他需要展示的量 */
  metrics: Record<string, number>;
}

/** 「读取实验」：C 提供给 B 的完整快照（PRD 4.2） */
export interface ExperimentSnapshot {
  experimentId: ExperimentId;
  params: ParamValues;
  runState: RunState;
  /** 当前动画时间，单位 s */
  t: number;
  result: ExperimentResult;
  /** 最近若干次操作，让 AI 知道「刚才变了什么」（PRD 5.5） */
  recentOps: ControlOp[];
}

/* ───────────────────────── 自然语言调参 ───────────────────────── */

export interface CommandRequest {
  experimentId: ExperimentId;
  text: string;
  snapshot: ExperimentSnapshot;
  /** 幂等键：同一操作重复发送只执行一次（PRD §6） */
  requestId: string;
  /**
   * 上一次返回 needConfirm 时，前端等用户点「确认」后再带 confirmed: true 重发同一条文本。
   * 此时服务端直接放行，不再二次确认。
   */
  confirmed?: boolean;
}

export interface CommandResponse {
  ok: boolean;
  /** 校验通过、可直接执行的原子操作 */
  ops: ControlOp[];
  /** 执行之后才对用户说的话。不能只在聊天里说「改好了」（PRD 4.2） */
  reply: string;
  /** 指令本身不合法时说明原因，不静默改成别的数值 */
  rejected?: { reason: string };
  /** 含糊指令 / 运行中改参会重置本轮，需先确认 */
  needConfirm?: { reason: string };
  /** 走的是规则解析还是模型解析，便于排查 */
  source: 'rule' | 'llm';
}

/* ───────────────────────── 聊天与 SSE ───────────────────────── */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  characterId: CharacterId;
  level: AnswerLevel;
  /** 多轮历史，靠它实现「连续对话」 */
  messages: ChatMessage[];
  feature: PartnerFeature;
  context?: {
    snapshot?: ExperimentSnapshot;
    taskId?: string;
    doneTaskIds?: string[];
  };
}

/** POST /api/chat 的 SSE 流事件 */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; full: string }
  | { type: 'error'; message: string };

/* ───────────────────────── 任务与判题 ───────────────────────── */

/** 下发给前端的任务（不含答案，PRD §6） */
export interface TaskPublic {
  id: string;
  experimentId: ExperimentId;
  title: string;
  /** 探索目标 */
  goal: string;
  /** 「AI 引导」第一层可执行提示，不直接给答案（PRD 5.6） */
  hint: string;
  question: {
    stem: string;
    options: string[];
  };
}

export type TaskStatus = 'todo' | 'active' | 'done';

export interface JudgeRequest {
  taskId: string;
  optionIndex: number;
}

export interface JudgeResponse {
  correct: boolean;
  explain: string;
  /** 答对后补上的知识规律总结 */
  summary?: string;
}

/* ───────────────────────── 挑战 ───────────────────────── */

export interface ChallengeSpec {
  id: string;
  title: string;
  /** 目标，如「让落点达到 30 m」 */
  goal: string;
  /** 固定条件，如「高度保持 20 m」 */
  fixedDesc: string;
  /** 程序侧强制校验的固定参数 */
  fixed: ParamValues;
  /** 允许用户修改的参数 key */
  editable: string[];
  /** 判定区间：不要求精确命中，给容差 */
  target: { key: string; label: string; min: number; max: number; unit: string };
}

export interface ChallengeVerifyRequest {
  challenge: ChallengeSpec;
  params: ParamValues;
}

export interface ChallengeVerifyResponse {
  pass: boolean;
  actual: number;
  message: string;
}

/* ───────────────────────── 人物 ───────────────────────── */

export interface Character {
  id: CharacterId;
  name: string;
  nameEn: string;
  /** 先用 emoji 占位，A 出卡通头像后换成图片路径 */
  avatar: string;
  quote: string;
  quoteSource: string;
  personality: string;
  speakingStyle: string;
  expertise: string;
  /** 历史知识边界：这一年之后的理论他「不知道」 */
  boundaryYear: number;
  boundaryNote: string;
  experiments: ExperimentId[];
  accent: string;
}
