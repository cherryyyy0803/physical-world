import { memo, useEffect, useRef, useState } from 'react';
import type {
  AnswerLevel,
  Character,
  ControlOp,
  ExperimentSnapshot,
  PartnerFeature,
} from '@pw/contracts';
import { parseCommandRequest, streamChatRequest } from '../api';
import { getCharacterTheme } from '../theme';

export interface ChatItem {
  role: 'user' | 'assistant';
  content: string;
  failed?: boolean;
  /** 用户原话，用于重试 */
  source?: string;
}

interface Props {
  character: Character;
  feature: PartnerFeature;
  level: AnswerLevel;
  onLevelChange: (level: AnswerLevel) => void;
  taskId?: string;
  doneTaskIds: string[];
  getSnapshot?: () => ExperimentSnapshot | undefined;
  onOps?: (ops: ControlOp[], reply: string) => void;
  /** 点击菜单后自动发起的一轮问答 */
  autoPrompt?: { content: string; display: string; tag?: string; seq: number } | null;
  /** 1v1 轻松生活化模式（隐藏难度条，使用日常开场与大头像欢迎态） */
  casualMode?: boolean;
  /** 实验聊天栏单行快捷提问 */
  quickPrompts?: Array<{ label: string; text: string }>;
}

const LEVELS: Array<{ key: AnswerLevel; label: string; idx: number }> = [
  { key: 'plain', label: '通俗', idx: 0 },
  { key: 'normal', label: '正常', idx: 1 },
  { key: 'expert', label: '专业', idx: 2 },
];

function ChatThread({
  character,
  feature,
  level,
  onLevelChange,
  taskId,
  doneTaskIds,
  getSnapshot,
  onOps,
  autoPrompt,
  casualMode = false,
  quickPrompts,
}: Props) {
  const theme = getCharacterTheme(character.id);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ ops: ControlOp[]; reply: string; text: string } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const lastAutoSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<ChatItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  const ask = async (text: string, display?: string) => {
    if (busy) return;
    const before = itemsRef.current;
    const userItem: ChatItem = {
      role: 'user',
      content: display ?? text,
      source: text,
    };
    setItems((prev) => [...prev, userItem]);
    setInput('');
    setBusy(true);

    /* 1. 实验模式下先尝试自然语言指令解析（不消耗模型额度） */
    const snapshot = getSnapshot?.();
    if (snapshot) {
      try {
        const res = await parseCommandRequest({
          experimentId: snapshot.experimentId,
          text,
          snapshot,
          requestId: crypto.randomUUID(),
        });

        if (res.needConfirm && res.ops.length > 0) {
          setPending({ ops: res.ops, reply: res.reply, text });
          setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
          setBusy(false);
          return;
        }

        if (res.ok && res.ops.length > 0) {
          onOps?.(res.ops, res.reply);
          setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
          setBusy(false);
          return;
        }

        if (res.rejected && res.rejected.reason !== '属于提问，不是可执行指令') {
          setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
          setBusy(false);
          return;
        }
      } catch {
        // 指令接口异常不阻断，继续走聊天
      }
    }

    /* 2. 走真实流式聊天接口 */
    await runChat([...before, userItem]);
  };

  const runChat = async (history: ChatItem[]) => {
    const body = {
      characterId: character.id,
      level,
      feature,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      context: {
        snapshot: getSnapshot?.(),
        taskId,
        doneTaskIds,
      },
    };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setItems((prev) => [...prev, { role: 'assistant', content: '' }]);
    setBusy(true);

    let acc = '';
    try {
      await streamChatRequest(
        body,
        (delta) => {
          acc += delta;
          setItems((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: acc };
            }
            return next;
          });
        },
        controller.signal,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setItems((prev) => {
        const next = prev.slice();
        next[next.length - 1] = {
          role: 'assistant',
          content: acc || `这次没接上模型：${message}`,
          failed: !acc,
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoPrompt || autoPrompt.seq === lastAutoSeq.current) return;
    lastAutoSeq.current = autoPrompt.seq;
    void ask(autoPrompt.content, autoPrompt.display);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt?.seq]);

  const confirmPending = async () => {
    if (!pending) return;
    const snapshot = getSnapshot?.();
    setPending(null);
    if (!snapshot) return;
    try {
      const res = await parseCommandRequest({
        experimentId: snapshot.experimentId,
        text: pending.text,
        snapshot,
        requestId: crypto.randomUUID(),
        confirmed: true,
      });
      if (res.ok && res.ops.length > 0) {
        onOps?.(res.ops, res.reply);
      }
      setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setItems((prev) => [
        ...prev,
        { role: 'assistant', content: `执行失败：${e instanceof Error ? e.message : '未知错误'}` },
      ]);
    }
  };

  const retryLast = () => {
    const lastUser = [...items].reverse().find((m) => m.role === 'user');
    if (!lastUser?.source) return;
    setItems((prev) => prev.filter((m) => !m.failed));
    void ask(lastUser.source, lastUser.content);
  };

  const activeIdx = LEVELS.find((x) => x.key === level)?.idx ?? 1;

  return (
    <div className={`pw-chat ${casualMode ? 'is-casual' : ''}`}>
      {!casualMode && (
        <div className="pw-level-bar">
          <span>回答风格</span>
          <div className="pw-seg-mini">
            <div
              className="pw-seg-slider"
              style={{ transform: `translateX(${activeIdx * 100}%)` }}
            />
            {LEVELS.map((lv) => (
              <button
                key={lv.key}
                type="button"
                className={level === lv.key ? 'active' : ''}
                onClick={() => onLevelChange(lv.key)}
              >
                {lv.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={casualMode ? 'chat1v1-stream' : 'pw-chat-messages'} ref={listRef}>
        {items.length === 0 && casualMode && (
          <div className="chat1v1-welcome">
            <div className="chat1v1-welcome-avatar">
              <img src={theme.portrait} alt={character.name} />
            </div>
            <h2>和{character.name}随便聊聊</h2>
            <p>{theme.greeting}</p>
            <div className="life-starters">
              {theme.starters.map((st) => (
                <button key={st} type="button" className="life-chip" onClick={() => void ask(st)}>
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && !casualMode && (
          <div className="pw-msg-row ai">
            <div className="pw-msg-bubble">
              嗨！我是{character.name}。你可以滑动滑块、键盘输入数值，或者直接告诉我「把初速度调到 20」，我立刻帮你调好！
            </div>
          </div>
        )}

        {items.map((m, i) =>
          casualMode ? (
            <div key={i} className={`im-row ${m.role === 'user' ? 'user' : 'ai'}`}>
              {m.role === 'assistant' && (
                <div className="im-avatar">
                  <img src={theme.portrait} alt={character.name} />
                </div>
              )}
              <div className={`im-bubble ${m.failed ? 'failed' : ''}`}>
                {m.content ? (
                  m.content
                ) : busy ? (
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  ''
                )}
              </div>
            </div>
          ) : (
            <div key={i} className={`pw-msg-row ${m.role === 'user' ? 'user' : 'ai'}`}>
              <div className={`pw-msg-bubble ${m.failed ? 'failed' : ''}`}>
                {m.content ? (
                  m.content
                ) : busy ? (
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  ''
                )}
              </div>
            </div>
          ),
        )}

        {pending && (
          <div className="pw-confirm-bar">
            <span>{pending.reply}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="pw-pill-btn primary" onClick={() => void confirmPending()}>
                确认修改
              </button>
              <button type="button" className="pw-pill-btn" onClick={() => setPending(null)}>
                算了
              </button>
            </div>
          </div>
        )}

        {items.some((m) => m.failed) && (
          <button type="button" className="pw-text-btn" style={{ alignSelf: 'flex-start' }} onClick={retryLast}>
            重试上一次
          </button>
        )}
      </div>

      {!casualMode && quickPrompts && quickPrompts.length > 0 && (
        <div className="pw-quick-prompts">
          {quickPrompts.map((qp) => (
            <button
              key={qp.label}
              type="button"
              className="pw-quick-chip"
              disabled={busy}
              onClick={() => void ask(qp.text)}
            >
              {qp.label}
            </button>
          ))}
        </div>
      )}

      <form
        className={casualMode ? 'im-composer' : 'pw-chat-input-bar'}
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) void ask(input.trim());
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            casualMode ? '随便聊点什么，不一定是物理哦…' : '说「把初速度设为 20」或直接提问…'
          }
          disabled={busy}
        />
        <button
          type="submit"
          className={casualMode ? 'im-send-btn' : 'pw-btn pw-btn-launch pw-btn-sm'}
          style={casualMode ? undefined : { width: 'auto', height: 34 }}
          disabled={busy || !input.trim()}
        >
          {busy ? '…' : '发送'}
        </button>
      </form>
    </div>
  );
}

export default memo(ChatThread);
