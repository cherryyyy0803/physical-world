import type {
  CommandRequest,
  CommandResponse,
  ControlOp,
  ExperimentSnapshot,
  ParamSpec,
  ParamValues,
} from '@pw/shared';
import { PROJECTILE_PARAMS, applyOps, compute } from '@pw/core';

/**
 * 规则解析层 —— 不经过模型就能把「把初速度调到 15」变成可执行操作。
 *
 * 为什么先做规则：
 * 1. 第 4 天的里程碑就是「说一句话 → 改变实验参数」，规则版当天能通，不等模型。
 * 2. 模型失败、超时、限流时，PRD §6 要求不能假装执行 —— 规则层正好兜底。
 * 3. 模型解析只在规则层认不出时兜底，两条路产出同一种 CommandResponse。
 */

const CN_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 从文本里抠出数字，阿拉伯数字优先，其次中文数字（含「十五」「二十」「三点五」） */
export function parseNumber(text: string): number | null {
  const arabic = text.match(/(\d+(?:\.\d+)?)/);
  if (arabic?.[1]) return Number.parseFloat(arabic[1]);

  // 「快一点」「大一些」里的「一」不是数值，先剔掉再找中文数字
  const cleaned = text.replace(/[快慢大小多少高低长短][一点位些]/g, '');

  const cn = cleaned.match(/([零一二两三四五六七八九十]+)(?:点([零一二三四五六七八九]+))?/);
  if (!cn?.[1]) return null;

  const whole = cn[1];
  const frac = cn[2];
  let value = 0;

  if (whole.includes('十')) {
    const [left, right] = whole.split('十');
    const tens = left ? (CN_DIGITS[left] ?? 0) : 1;
    const ones = right ? (CN_DIGITS[right] ?? 0) : 0;
    value = tens * 10 + ones;
  } else if (whole.length === 1) {
    value = CN_DIGITS[whole] ?? 0;
  } else {
    return null;
  }

  if (frac) {
    const decimals = Array.from(frac)
      .map((ch) => CN_DIGITS[ch] ?? 0)
      .join('');
    value += Number.parseFloat(`0.${decimals}`);
  }
  return value;
}

interface ParamKeyword {
  key: string;
  pattern: RegExp;
}

/** 顺序即优先级：越具体的词放越前面 */
const PARAM_KEYWORDS: ParamKeyword[] = [
  { key: 'g', pattern: /重力加速度|重力|g值|小g/ },
  { key: 'h', pattern: /抛出高度|高度|离地|高一点|高一些/ },
  { key: 'v0', pattern: /初速度|初速|水平速度|水平初速度|抛出速度|速度/ },
];

const SET_VERB = /调到|调成|设为|设置成|设置|改成|改为|变成|变为|提到|提高到|降到|降低到|给|取/;

const RUN_WORDS: Array<{ op: ControlOp; pattern: RegExp }> = [
  { op: { type: 'reset' }, pattern: /重置|复位|重来|恢复初始|清空/ },
  { op: { type: 'pause' }, pattern: /暂停|停一下|停下来|先停/ },
  { op: { type: 'resume' }, pattern: /继续|接着跑|恢复运行/ },
  { op: { type: 'start' }, pattern: /开始|启动|运行|播放|抛出|发射/ },
];

const QUESTION_HINT = /为什么|怎么会|是什么|什么意思|原理|会不会|是否|能不能|如何|多少|吗|呢|怎样|怎么样/;
const VAGUE_HINT = /快一点|慢一点|快些|慢些|大一点|小一点|大一些|小一些|多一点|少一点|加快|减慢|调快点|调慢点/;

const PARAM_LABEL: Record<string, string> = { v0: '初速度', h: '抛出高度', g: '重力加速度' };

function specOf(key: string): ParamSpec {
  const spec = PROJECTILE_PARAMS.find((s) => s.key === key);
  if (!spec) throw new Error(`未知参数 ${key}`);
  return spec;
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** 执行完之后的回话。必须依据新参数算一遍再说（PRD 4.2） */
function replyAfterApply(
  before: ParamValues,
  after: ParamValues,
  changed: string[],
  snapshot: ExperimentSnapshot,
): string {
  const parts: string[] = [];
  for (const key of changed) {
    const spec = specOf(key);
    parts.push(`已将${spec.label}调整为 ${fmt(after[key] ?? 0)} ${spec.unit}`);
  }
  const untouched = Object.keys(after).filter((k) => !changed.includes(k));
  if (untouched.length > 0) {
    const kept = untouched
      .map((k) => {
        const spec = specOf(k);
        return `${spec.label}保持 ${fmt(after[k] ?? 0)} ${spec.unit}`;
      })
      .join('，');
    parts.push(kept);
  }

  const result = compute(snapshot.experimentId, after);
  const head = parts.length > 0 ? `${parts.join('，')}。` : '参数没有变化。';
  return `${head}按这组参数，落地时间 ${result.flightTime} s，水平射程 ${result.range} m。`;
}

export function parseCommand(req: CommandRequest): CommandResponse {
  const text = req.text.trim();
  if (!text) {
    return { ok: false, ops: [], reply: '我没听清，再说一次？', rejected: { reason: '空指令' }, source: 'rule' };
  }

  const snapshot = req.snapshot;
  const number = parseNumber(text);
  const hasSetVerb = SET_VERB.test(text);
  const matchedParam = PARAM_KEYWORDS.find((k) => k.pattern.test(text));

  /* 1. 明确的调参指令优先，即使句尾带问号 */
  if (hasSetVerb && matchedParam && number !== null) {
    const key = matchedParam.key;
    const spec = specOf(key);

    if (number < spec.min || number > spec.max) {
      return {
        ok: false,
        ops: [],
        reply: `${spec.label}只能取 ${spec.min}–${spec.max} ${spec.unit}，你说的 ${fmt(number)} ${spec.unit} 超出了这个范围，所以我没有执行。`,
        rejected: { reason: '参数超出合法范围' },
        source: 'rule',
      };
    }

    const ops: ControlOp[] = [{ type: 'setParam', key, value: number }];
    // 「调到 15 然后开始」这类连说，顺手把播放动作也带上
    if (/开始|启动|运行|播放|抛出|发射/.test(text)) ops.push({ type: 'start' });
    const after = applyOps(snapshot.params, ops);
    const reply = replyAfterApply(snapshot.params, after, [key], snapshot);

    if (snapshot.runState === 'running' && !req.confirmed) {
      return {
        ok: false,
        ops,
        reply: `现在正在运行，改${spec.label}会重新开始这一轮。确认的话我就改。`,
        needConfirm: { reason: '运行中修改参数会重置本轮' },
        source: 'rule',
      };
    }

    return { ok: true, ops, reply, source: 'rule' };
  }

  /* 2. 含糊指令：不猜，先问清楚（PRD 5.5） */
  if (VAGUE_HINT.test(text) && number === null) {
    return {
      ok: false,
      ops: [],
      reply: '「快一点 / 大一点」这类说法我不敢自己猜——你是想改初速度、抛出高度，还是重力加速度？大概想改成多少？',
      rejected: { reason: '指令含糊，缺少具体参数和数值' },
      source: 'rule',
    };
  }

  /* 3. 提问而不是操作 */
  if (QUESTION_HINT.test(text) && !hasSetVerb) {
    return {
      ok: false,
      ops: [],
      reply: '这听起来是个问题，不是操作指令——去聊天里问我就好。',
      rejected: { reason: '属于提问，不是可执行指令' },
      source: 'rule',
    };
  }

  /* 4. 播放控制 */
  for (const { op, pattern } of RUN_WORDS) {
    if (pattern.test(text)) {
      if (op.type === 'start' && snapshot.runState === 'running') {
        return { ok: false, ops: [], reply: '它已经在跑了。', rejected: { reason: '重复开始' }, source: 'rule' };
      }
      return { ok: true, ops: [op], reply: '好。', source: 'rule' };
    }
  }

  /* 5. 认不出来 */
  return {
    ok: false,
    ops: [],
    reply: '这句话我没能翻译成具体操作。你可以这样说：「把初速度调到 15」「高度改成 40」「暂停」。',
    rejected: { reason: '规则层无法解析' },
    source: 'rule',
  };
}

/** 给模型解析用的提示词，只在规则层失败时调用 */
export const COMMAND_SYSTEM_PROMPT = `你是一个把中文指令翻译成实验操作 JSON 的解析器。
可用参数：v0（初速度，单位 m/s，范围 1–50）、h（抛出高度，单位 m，范围 1–100）、g（重力加速度，单位 m/s²，范围 1.6–20）。
只输出 JSON，不要解释。格式：
{"ops":[{"type":"setParam","key":"v0","value":15}],"reply":"一句话说明你要做什么"}
可用 op.type：setParam / start / pause / resume / reset。
如果指令含糊、缺少数值、或超出范围，输出 {"ops":[],"reject":"原因"}。
如果这是提问而不是操作，输出 {"ops":[],"reject":"question"}。`;
