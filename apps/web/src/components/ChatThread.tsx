import { memo, useEffect, useRef, useState } from 'react';
import type {
  AnswerLevel,
  Character,
  ControlOp,
  ExperimentSnapshot,
  PartnerFeature,
} from '@pw/contracts';
import { parseCommandRequest, streamChatRequest } from '../api';

export interface ChatItem {
  role: 'user' | 'assistant';
  content: string;
  tag?: string;
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
  autoPrompt?: { content: string; display: string; tag: string; seq: number } | null;
}

const LEVEL_LABEL: Record<AnswerLevel, string> = {
  plain: '通俗',
  normal: '正常',
  expert: '专业',
};

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
}: Props) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ ops: ControlOp[]; reply: string; text: string } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const lastAutoSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** 与 items 同步的镜像，供发送时组装历史（setState 是异步的，闭包里的 items 会滞后） */
  const itemsRef = useRef<ChatItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  const ask = async (text: string, display?: string, tag?: string) => {
    if (busy) return;
    const before = itemsRef.current;
    const userItem: ChatItem = {
      role: 'user',
      content: display ?? text,
      tag,
      source: text,
    };
    setItems((prev) => [...prev, userItem]);
    setInput('');
    setBusy(true);

    /* 1. 先看是不是操作指令（不消耗模型额度，模型挂了也能用） */
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

        // 被拒的原因如果是「这是个问题」，就落到下面走聊天
        if (res.rejected && res.rejected.reason !== '属于提问，不是可执行指令') {
          setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
          setBusy(false);
          return;
        }
      } catch {
        // 指令接口异常不阻断，继续走聊天
      }
    }

    /* 2. 走模型 */
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
            if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: acc };
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

  /* 菜单点击后自动触发的一轮 */
  useEffect(() => {
    if (!autoPrompt || autoPrompt.seq === lastAutoSeq.current) return;
    lastAutoSeq.current = autoPrompt.seq;
    void ask(autoPrompt.content, autoPrompt.display, autoPrompt.tag);
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
        setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      } else {
        setItems((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      }
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
    void ask(lastUser.source, lastUser.content, lastUser.tag);
  };

  return (
    <div className="chat">
      <div className="chat-level">
        <span className="muted small">回答难度</span>
        <div className="seg">
          {(['plain', 'normal', 'expert'] as AnswerLevel[]).map((lv) => (
            <button
              key={lv}
              className={level === lv ? 'on' : ''}
              onClick={() => onLevelChange(lv)}
            >
              {LEVEL_LABEL[lv]}
            </button>
          ))}
        </div>
      </div>

      <div className="chat-list" ref={listRef}>
        {items.length === 0 && (
          <div className="chat-empty">
            <span className="chat-empty-avatar" style={{ background: `${character.accent}1f` }}>
              {character.avatar}
            </span>
            <p>
              {character.name}在等你开口。
              <br />
              <span className="muted small">
                可以问知识，也可以直接下指令，比如「把初速度调到 15」。
              </span>
            </p>
          </div>
        )}

        {items.map((m, i) => (
          <div key={i} className={`bubble-row ${m.role}`}>
            {m.role === 'assistant' && (
              <span className="bubble-avatar" style={{ background: `${character.accent}1f` }}>
                {character.avatar}
              </span>
            )}
            <div className={`bubble ${m.failed ? 'failed' : ''}`}>
              {m.tag && <span className="bubble-tag">{m.tag}</span>}
              <span className="bubble-text">{m.content || (busy ? '…' : '')}</span>
            </div>
          </div>
        ))}

        {pending && (
          <div className="confirm-bar">
            <span>{pending.reply}</span>
            <div>
              <button className="btn primary sm" onClick={confirmPending}>
                确认修改
              </button>
              <button className="btn ghost sm" onClick={() => setPending(null)}>
                算了
              </button>
            </div>
          </div>
        )}

        {items.some((m) => m.failed) && (
          <button className="link retry" onClick={retryLast}>
            重试上一次
          </button>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) void ask(input.trim());
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问点什么，或者直接下指令…"
          disabled={busy}
        />
        <button className="btn primary sm" type="submit" disabled={busy || !input.trim()}>
          {busy ? '…' : '发送'}
        </button>
      </form>
    </div>
  );
}

export default memo(ChatThread);
