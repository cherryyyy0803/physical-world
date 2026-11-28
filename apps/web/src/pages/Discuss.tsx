import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CharacterId } from '@pw/contracts';
import { CHARACTER_LIST } from '@pw/contracts';
import { streamChatRequest, type Bootstrap } from '../api';
import { getCharacterTheme } from '../theme';

interface Props {
  boot: Bootstrap;
  doneTaskIds: string[];
  onBack: () => void;
}

interface DiscussMsg {
  role: 'user' | 'ai' | 'summary';
  charId?: CharacterId;
  text: string;
}

const PRESET_TOPICS = [
  '光到底是波还是粒子？',
  '发现自然规律，直觉和动手实验哪个更重要？',
  '如果你们三位合伙开一家咖啡馆，会怎么分工？',
];

export default function Discuss({ boot, doneTaskIds, onBack }: Props) {
  const [phase, setPhase] = useState<'setup' | 'room'>('setup');
  const [picked, setPicked] = useState<CharacterId[]>(['galileo', 'hooke', 'young']);
  const [topicInput, setTopicInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [currentTopic, setCurrentTopic] = useState('');
  const [mentionedId, setMentionedId] = useState<CharacterId | null>(null);
  const [speakingId, setSpeakingId] = useState<CharacterId | null>(null);
  const [messages, setMessages] = useState<DiscussMsg[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, drawerOpen]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const stopSpeaking = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setSpeakingId(null);
  };

  const toggleSeat = (id: CharacterId) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /**
   * 依次调用现有 /api/chat 流式接口让入座物理学家轮流回应前文；
   * 后续队员 B 接入 /api/discuss 后可直接替换此处调度函数。
   */
  const runRoundtable = async (promptText: string, baseMsgs: DiscussMsg[]) => {
    stopSpeaking();
    cancelledRef.current = false;
    const order = mentionedId ? [mentionedId] : picked.slice();
    let rolling = baseMsgs.slice();

    for (const cid of order) {
      if (cancelledRef.current) break;
      setSpeakingId(cid);
      const controller = new AbortController();
      abortRef.current = controller;

      const historyText = rolling
        .slice(-6)
        .map((m) =>
          m.role === 'user'
            ? `学生：${m.text}`
            : m.charId
              ? `${boot.characters[m.charId].name}：${m.text}`
              : m.text,
        )
        .join('\n');

      let acc = '';
      try {
        await streamChatRequest(
          {
            characterId: cid,
            level: 'normal',
            feature: 'chat',
            messages: [
              {
                role: 'user',
                content: `这是一场轻松的跨时代物理学家圆桌讨论，请用你的性格简短回应（2-3 句话，不要重复前人的原话）：\n${historyText}\n最新提问：${promptText}`,
              },
            ],
            context: { doneTaskIds },
          },
          (delta) => {
            acc += delta;
          },
          controller.signal,
        );
      } catch {
        if (cancelledRef.current) break;
        acc = `${boot.characters[cid].name}：关于「${promptText}」，我觉得得先亲眼观察、把前提说清楚，再一起验证最有意思！`;
      }

      if (cancelledRef.current) break;
      const finalMsg: DiscussMsg = { role: 'ai', charId: cid, text: acc.trim() || '很有意思的观点！' };
      rolling = [...rolling, finalMsg];
      setMessages(rolling);
      setSpeakingId(null);
    }
    setSpeakingId(null);
  };

  const startDiscussion = (topic: string) => {
    if (picked.length < 2) return;
    const clean = topic.trim() || PRESET_TOPICS[2] || '物理规律是如何被发现的？';
    const initial: DiscussMsg[] = [{ role: 'user', text: clean }];
    setCurrentTopic(clean);
    setMentionedId(null);
    setMessages(initial);
    setPhase('room');
    setDrawerOpen(false);
    void runRoundtable(clean, initial);
  };

  const sendReply = (raw: string) => {
    const txt = raw.trim();
    if (!txt) return;
    const prefix = mentionedId ? `@${boot.characters[mentionedId].name} ` : '';
    const nextMsgs: DiscussMsg[] = [...messages, { role: 'user', text: prefix + txt }];
    setMessages(nextMsgs);
    setReplyInput('');
    void runRoundtable(txt, nextMsgs);
  };

  const requestSummary = () => {
    stopSpeaking();
    const names = picked.map((id) => boot.characters[id].name).join('、');
    setMessages((prev) => [
      ...prev,
      {
        role: 'summary',
        text: `围绕「${currentTopic}」，${names} 各自给出了鲜明视角：大家一致认为观察与实证是理解世界的根基，而在动手工具、直觉类比与表达风格上各有侧重。`,
      },
    ]);
    setDrawerOpen(true);
  };

  const getLatestBubble = (cid: CharacterId) => {
    if (speakingId === cid) return { typing: true, text: '' };
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === 'ai' && m.charId === cid) return { typing: false, text: m.text };
    }
    return null;
  };

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
  const posList = picked.length === 2 ? ['pos-left', 'pos-right'] : ['pos-left', 'pos-top', 'pos-right'];

  return (
    <div className="discuss-page">
      <header className="discuss-header">
        <div style={{ justifySelf: 'start' }}>
          <button
            className="hud-back"
            onClick={() => {
              stopSpeaking();
              onBack();
            }}
            title="返回首页"
            aria-label="返回首页"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
        </div>

        <h1 className="hud-title" style={{ fontSize: 18, justifySelf: 'center' }}>
          多人讨论室
        </h1>

        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8 }}>
          {phase === 'room' && speakingId && (
            <button className="discuss-action-chip stop" onClick={stopSpeaking}>
              停止发言
            </button>
          )}
          {phase === 'room' && (
            <>
              <button className="discuss-action-chip" onClick={requestSummary}>
                总结
              </button>
              <button className="discuss-action-chip" onClick={() => setDrawerOpen((v) => !v)}>
                对话记录
              </button>
              <button
                className="discuss-action-chip"
                onClick={() => {
                  stopSpeaking();
                  setPhase('setup');
                  setDrawerOpen(false);
                }}
              >
                换人
              </button>
            </>
          )}
        </div>
      </header>

      {phase === 'setup' ? (
        <div className="discuss-setup">
          <div className="discuss-setup-head">
            <h2>邀请 2–3 位物理学家入座</h2>
            <p>选好嘉宾后抛出一个话题，听听不同时代的思想碰撞</p>
          </div>

          <div className="seat-grid">
            {CHARACTER_LIST.map((c) => {
              const t = getCharacterTheme(c.id);
              const isPicked = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  className={`seat-card ${isPicked ? 'picked' : ''}`}
                  style={{ '--seat-accent': t.accent, '--seat-soft': t.soft } as CSSProperties}
                  onClick={() => toggleSeat(c.id)}
                >
                  <span className="seat-check">{isPicked ? '✓' : ''}</span>
                  <img className="seat-avatar" src={t.portrait} alt={c.name} />
                  <strong style={{ fontSize: 17 }}>{c.name}</strong>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-sub)', marginTop: 3 }}>
                    {t.mood.split('，')[0]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="discuss-topic-box">
            <div className="topic-presets">
              {PRESET_TOPICS.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  className="topic-pill"
                  onClick={() => setTopicInput(tp)}
                >
                  {tp}
                </button>
              ))}
            </div>
            <form
              className="im-composer"
              style={{ width: '100%' }}
              onSubmit={(e) => {
                e.preventDefault();
                startDiscussion(topicInput);
              }}
            >
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="输入想讨论的话题，或点上方推荐话题…"
              />
              <button
                type="submit"
                className="im-send-btn"
                style={{ background: '#222B32', opacity: picked.length >= 2 ? 1 : 0.45 }}
                disabled={picked.length < 2}
              >
                {picked.length >= 2 ? `开始讨论（${picked.length}人）` : '请至少选 2 位'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="discuss-room">
          <div className="salon-stage">
            <img className="salon-table-img" src="/assets/salon-table.png" alt="物理沙龙木桌" />
            <div>
              {picked.map((id, idx) => {
                const c = boot.characters[id];
                const t = getCharacterTheme(id);
                const pos = posList[idx] ?? 'pos-right';
                const bub = getLatestBubble(id);
                const isSpk = speakingId === id;
                const isMent = mentionedId === id;
                return (
                  <div
                    key={id}
                    className={`salon-seat ${pos} ${isSpk ? 'speaking' : ''} ${isMent ? 'mentioned' : ''}`}
                    style={
                      {
                        '--seat-accent': t.accent,
                        '--seat-soft': t.soft,
                        '--seat-border': t.border,
                      } as CSSProperties
                    }
                  >
                    {bub && (
                      <div className="salon-bubble">
                        {bub.typing ? (
                          <span className="typing-dots">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          bub.text
                        )}
                      </div>
                    )}
                    <button
                      className="salon-avatar-btn"
                      onClick={() => setMentionedId((prev) => (prev === id ? null : id))}
                      title={`点击可 @ 点名${c.name}`}
                    >
                      <img src={t.portrait} alt={c.name} />
                    </button>
                    <span className="salon-seat-name">{isMent ? `@${c.name}` : c.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="salon-bottom-bar">
            {lastUserMsg && <div className="salon-user-echo">{lastUserMsg}</div>}
            <form
              className="salon-input-shell"
              onSubmit={(e) => {
                e.preventDefault();
                sendReply(replyInput);
              }}
            >
              <input
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder={
                  mentionedId
                    ? `正在点名 @${boot.characters[mentionedId].name}，输入你想问 TA 的话…`
                    : '想说什么都可以……（点击头像可 @ 点名）'
                }
              />
              <button type="submit" className="salon-send-circle" aria-label="发送">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>

          <aside className={`transcript-drawer ${drawerOpen ? 'open' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <strong style={{ fontSize: 14.5 }}>圆桌对话记录</strong>
              <button className="close-circle" onClick={() => setDrawerOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="transcript-list" ref={listRef}>
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return (
                    <div key={i} className="im-row user">
                      <div className="im-bubble" style={{ background: '#222B32', fontSize: 13 }}>
                        {m.text}
                      </div>
                    </div>
                  );
                }
                if (m.role === 'summary') {
                  return (
                    <div key={i} className="discuss-summary-card">
                      <strong>圆桌观点小结</strong>
                      <div style={{ marginTop: 4 }}>{m.text}</div>
                    </div>
                  );
                }
                const c = m.charId ? boot.characters[m.charId] : null;
                const t = m.charId ? getCharacterTheme(m.charId) : null;
                return (
                  <div key={i} className="im-row ai">
                    {t && (
                      <div className="im-avatar">
                        <img src={t.portrait} alt={c?.name ?? ''} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '80%' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t?.accent }}>{c?.name}</span>
                      <div
                        className="im-bubble"
                        style={{ fontSize: 13, borderLeft: `3px solid ${t?.accent ?? '#ccc'}` }}
                      >
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
