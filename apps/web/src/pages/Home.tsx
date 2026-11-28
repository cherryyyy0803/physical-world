import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { CharacterId, ExperimentId, SubjectId } from '@pw/contracts';
import { CHARACTER_LIST, experimentsOfSubject } from '@pw/contracts';
import type { Bootstrap } from '../api';
import { getCharacterTheme, getSubjectTheme } from '../theme';

interface Props {
  boot: Bootstrap;
  doneTaskIds: string[];
  onEnterLab: (experimentId: ExperimentId, characterId: CharacterId) => void;
  onEnterChat: (characterId: CharacterId) => void;
  onEnterDiscuss: () => void;
}

type Mode = 'character' | 'subject';

function SubjectIcon({ id }: { id: SubjectId }) {
  if (id === 'mechanics') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 19C7 10 12 6 20 6" />
        <circle cx="20" cy="6" r="2.5" fill="currentColor" />
        <path d="M4 19h16" />
      </svg>
    );
  }
  if (id === 'optics') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.3M12 19.2v2.3M4.93 4.93l1.63 1.63M17.44 17.44l1.63 1.63M2.5 12h2.3M19.2 12h2.3M4.93 19.07l1.63-1.63M17.44 6.56l1.63-1.63" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

export default function Home({ boot, onEnterLab, onEnterChat, onEnterDiscuss }: Props) {
  const [mode, setMode] = useState<Mode>('character');
  const [query, setQuery] = useState('');
  const [modalCharId, setModalCharId] = useState<CharacterId | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | null>(null);
  const [toast, setToast] = useState<{ text: string; actionLabel?: string; onAction?: () => void } | null>(null);

  const say = (text: string, actionLabel?: string, onAction?: () => void) => {
    setToast({ text, actionLabel, onAction });
    window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalCharId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();

  const matchedChars = useMemo(
    () =>
      CHARACTER_LIST.filter((c) => {
        const theme = getCharacterTheme(c.id);
        return (
          c.name.toLowerCase().includes(q) ||
          c.nameEn.toLowerCase().includes(q) ||
          c.expertise.toLowerCase().includes(q) ||
          theme.domainShort.toLowerCase().includes(q)
        );
      }),
    [q],
  );

  const matchedExperiments = useMemo(
    () =>
      boot.experiments.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          boot.subjects.find((s) => s.id === e.subject)?.name.toLowerCase().includes(q),
      ),
    [boot.experiments, boot.subjects, q],
  );

  const enterExperiment = (experimentId: ExperimentId, characterId?: CharacterId) => {
    const target = boot.experimentMap[experimentId];
    const partnerId = characterId ?? boot.defaultCharacter[experimentId];
    const partner = boot.characters[partnerId];
    if (!target.available) {
      say(`「${target.name}」后续开放，敬请期待`, `先和${partner.name}聊天`, () =>
        onEnterChat(partnerId),
      );
      return;
    }
    setModalCharId(null);
    onEnterLab(experimentId, partnerId);
  };

  const activeSubject = selectedSubject
    ? boot.subjects.find((s) => s.id === selectedSubject) ?? null
    : null;
  const activeSubjectTheme = selectedSubject ? getSubjectTheme(selectedSubject) : null;
  const subjectExperiments = selectedSubject ? experimentsOfSubject(selectedSubject) : [];

  const modalChar = modalCharId ? boot.characters[modalCharId] : null;
  const modalTheme = modalCharId ? getCharacterTheme(modalCharId) : null;

  return (
    <div className="pw-page">
      {/* ① 左上角品牌名与引导语 ② 右上角双入口切换与搜索栏 */}
      <header className="pw-topbar">
        <button
          className="pw-brand"
          onClick={() => {
            setMode('character');
            setQuery('');
            setSelectedSubject(null);
            setModalCharId(null);
          }}
        >
          <span className="pw-brand-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 18.5C6.8 9.2 12.2 5.8 19.5 5.8" stroke="#4E9A74" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="19.5" cy="5.8" r="3" fill="#F2785C" />
              <circle cx="11.2" cy="9.2" r="2" fill="#E5A032" />
            </svg>
          </span>
          <span className="pw-brand-titles">
            <span className="pw-brand-name-row">
              <span className="pw-brand-cn">物理世界</span>
              <span className="pw-brand-en">Physical World</span>
            </span>
            <span className="pw-brand-guide">让物理，从理解走向探索。</span>
          </span>
        </button>

        <div className="pw-top-tools">
          <div className={`pw-mode-switch ${mode === 'subject' ? 'is-subject' : ''}`} role="tablist">
            <div className="pw-mode-slider" aria-hidden="true" />
            <button
              role="tab"
              aria-selected={mode === 'character'}
              className={`pw-mode-btn ${mode === 'character' ? 'active' : ''}`}
              onClick={() => {
                setMode('character');
                setQuery('');
              }}
            >
              人物模式
            </button>
            <button
              role="tab"
              aria-selected={mode === 'subject'}
              className={`pw-mode-btn ${mode === 'subject' ? 'active' : ''}`}
              onClick={() => {
                setMode('subject');
                setQuery('');
              }}
            >
              知识模式
            </button>
          </div>

          <div className="pw-search-wrap">
            <span className="pw-search-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              className="pw-search-input"
              placeholder="搜物理学家、领域或实验…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && (
              <button className="pw-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
                ×
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ③ 中间主视觉区域 */}
      <main className="pw-stage">
        <div className="pw-stage-inner">
          {searching ? (
            <div className="pw-search-stage pw-view-fade">
              <div className="pw-search-head">
                <h2>搜索「{query.trim()}」</h2>
                <button className="pw-text-btn" onClick={() => setQuery('')}>
                  返回首页
                </button>
              </div>

              {matchedChars.length === 0 && matchedExperiments.length === 0 ? (
                <p className="pw-empty-text">
                  没找到相关内容，试试搜「平抛运动」「伽利略」或「干涉」。
                </p>
              ) : (
                <>
                  {matchedExperiments.length > 0 && (
                    <>
                      <div className="pw-search-group-label">物理实验</div>
                      {matchedExperiments.map((e) => {
                        const subj = boot.subjects.find((s) => s.id === e.subject);
                        const pid = boot.defaultCharacter[e.id];
                        const partner = boot.characters[pid];
                        const pTheme = getCharacterTheme(pid);
                        return (
                          <div key={e.id} className="pw-result-row">
                            <div className="pw-exp-row-left">
                              <img className="pw-mini-avatar" src={pTheme.portrait} alt={partner.name} />
                              <div>
                                <div className="pw-row-title">{e.name}</div>
                                <div className="pw-row-sub">
                                  {subj?.name} · 默认伙伴：{partner.name}
                                </div>
                              </div>
                            </div>
                            <button
                              className={`pw-pill-btn ${e.available ? 'primary' : 'muted-btn'}`}
                              style={
                                e.available
                                  ? { background: pTheme.accent, borderColor: pTheme.accent }
                                  : undefined
                              }
                              onClick={() => enterExperiment(e.id)}
                            >
                              {e.available ? '进入实验' : '后续开放'}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {matchedChars.length > 0 && (
                    <>
                      <div className="pw-search-group-label">物理学家</div>
                      {matchedChars.map((c) => {
                        const cTheme = getCharacterTheme(c.id);
                        const expId = c.experiments[0];
                        if (!expId) return null;
                        const firstExp = boot.experimentMap[expId];
                        return (
                          <div key={c.id} className="pw-result-row">
                            <div className="pw-exp-row-left">
                              <img className="pw-mini-avatar" src={cTheme.portrait} alt={c.name} />
                              <div>
                                <div className="pw-row-title">
                                  {c.name} <span className="pw-row-en">{c.nameEn}</span>
                                </div>
                                <div className="pw-row-sub">{cTheme.domainShort}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="pw-pill-btn" onClick={() => onEnterChat(c.id)}>
                                与他聊聊
                              </button>
                              <button
                                className={`pw-pill-btn ${firstExp?.available ? 'primary' : 'muted-btn'}`}
                                style={
                                  firstExp?.available
                                    ? { background: cTheme.accent, borderColor: cTheme.accent }
                                    : undefined
                                }
                                onClick={() => firstExp && enterExperiment(firstExp.id, c.id)}
                              >
                                {firstExp?.available ? firstExp.name : '实验后续开放'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          ) : mode === 'character' ? (
            <div className="pw-physicist-stage pw-view-fade">
              {CHARACTER_LIST.map((c) => {
                const theme = getCharacterTheme(c.id);
                const expId = c.experiments[0];
                if (!expId) return null;
                const exp = boot.experimentMap[expId];
                const style = { '--char-accent': theme.accent } as CSSProperties;
                return (
                  <button
                    key={c.id}
                    className="pw-physicist-item"
                    style={style}
                    onClick={() => setModalCharId(c.id)}
                  >
                    <div className="pw-quote-bubble" role="tooltip">
                      <span className="pw-quote-text">“{theme.hoverQuote}”</span>
                    </div>
                    <div className="pw-avatar-wrap">
                      <div className="pw-avatar-halo" aria-hidden="true" />
                      <img className="pw-avatar-img" src={theme.portrait} alt={c.name} />
                    </div>
                    <h2 className="pw-physicist-name">{c.name}</h2>
                    <p className="pw-physicist-domain">{theme.domainShort}</p>
                    <span
                      className={`pw-exp-tag ${exp?.available ? 'open' : 'soon'}`}
                      style={
                        exp?.available
                          ? { background: theme.soft, color: theme.ink }
                          : undefined
                      }
                    >
                      <span className="pw-status-dot-sm" />
                      <span>{exp?.available ? exp.name : `${exp?.name} · 后续开放`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pw-subject-stage pw-view-fade">
              <div className="pw-subject-grid">
                {boot.subjects.map((s) => {
                  const sTheme = getSubjectTheme(s.id);
                  const exps = experimentsOfSubject(s.id);
                  const openCount = exps.filter((e) => e.available).length;
                  const active = selectedSubject === s.id;
                  const style = { '--subj-color': sTheme.color } as CSSProperties;
                  return (
                    <button
                      key={s.id}
                      className={`pw-subject-card ${active ? 'active' : ''}`}
                      style={style}
                      onClick={() => setSelectedSubject(active ? null : s.id)}
                    >
                      <div
                        className="pw-subject-icon"
                        style={{ background: sTheme.bg, color: sTheme.color }}
                      >
                        <SubjectIcon id={s.id} />
                      </div>
                      <h3 className="pw-subject-name">{s.name}</h3>
                      <p className="pw-subject-summary">{s.summary}</p>
                      <span
                        className={`pw-exp-tag ${openCount > 0 ? 'open' : 'soon'}`}
                        style={
                          openCount > 0
                            ? { background: sTheme.bg, color: sTheme.color }
                            : undefined
                        }
                      >
                        <span className="pw-status-dot-sm" />
                        <span>{openCount > 0 ? `${openCount} 个实验可开始` : '后续开放'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pw-subject-panel-slot">
                {activeSubject && activeSubjectTheme && (
                  <div className="pw-subject-panel">
                    <div key={activeSubject.id} className="pw-panel-body-fade">
                      <div className="pw-subject-panel-head">
                        <h3>{activeSubject.name} · 关联实验</h3>
                        <button
                          className="pw-text-btn"
                          style={{ color: activeSubjectTheme.color }}
                          onClick={() => setSelectedSubject(null)}
                        >
                          收起
                        </button>
                      </div>
                      {subjectExperiments.length === 0 ? (
                        <p className="pw-row-sub" style={{ marginTop: 6 }}>
                          这个主题暂时还没有上线实验，先看看力学？{' '}
                          <button
                            className="pw-text-btn"
                            style={{ color: '#F2785C' }}
                            onClick={() => setSelectedSubject('mechanics')}
                          >
                            去力学看看 →
                          </button>
                        </p>
                      ) : (
                        <div className="pw-exp-list">
                          {subjectExperiments.map((e) => {
                            const pid = boot.defaultCharacter[e.id];
                            const partner = boot.characters[pid];
                            const pTheme = getCharacterTheme(pid);
                            return (
                              <div
                                key={e.id}
                                className={`pw-exp-row ${e.available ? 'open' : ''}`}
                                style={
                                  e.available ? { background: activeSubjectTheme.bg } : undefined
                                }
                              >
                                <div className="pw-exp-row-left">
                                  <img
                                    className="pw-mini-avatar"
                                    src={pTheme.portrait}
                                    alt={partner.name}
                                  />
                                  <div>
                                    <div className="pw-row-title">{e.name}</div>
                                    <div className="pw-row-sub">
                                      {e.summary} · 默认伙伴：{partner.name}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  className={`pw-pill-btn ${e.available ? 'primary' : 'muted-btn'}`}
                                  style={
                                    e.available
                                      ? {
                                          background: activeSubjectTheme.color,
                                          borderColor: activeSubjectTheme.color,
                                        }
                                      : undefined
                                  }
                                  onClick={() => enterExperiment(e.id)}
                                >
                                  {e.available ? '进入实验' : '后续开放'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ④ 右下角多人讨论室悬浮入口 */}
      <button className="pw-discuss-fab" onClick={onEnterDiscuss} aria-label="进入多人讨论室">
        <span className="pw-fab-avatars" aria-hidden="true">
          <img src="/assets/galileo.png" alt="" />
          <img src="/assets/hooke.png" alt="" />
          <img src="/assets/young.png" alt="" />
        </span>
        <span className="pw-fab-text">
          <span className="pw-fab-title">多人讨论室</span>
          <span className="pw-fab-sub">邀请 2–3 位物理学家</span>
        </span>
        <span className="pw-fab-badge">进入</span>
      </button>

      {/* 人物实验选择小弹窗（左：头像+与他聊聊，右：人物色系实验选择） */}
      <div
        className={`pw-modal-backdrop ${modalChar ? 'open' : ''}`}
        onClick={() => setModalCharId(null)}
        aria-hidden={!modalChar}
      >
        {modalChar && modalTheme && (
          <div
            className="pw-char-modal"
            style={
              {
                '--char-accent': modalTheme.accent,
                '--char-hover': modalTheme.hover,
                '--char-soft': modalTheme.soft,
                '--char-border': modalTheme.border,
              } as CSSProperties
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="pw-modal-close"
              onClick={() => setModalCharId(null)}
              aria-label="关闭弹窗"
            >
              ×
            </button>
            <div className="pw-char-modal-grid">
              <div className="pw-char-modal-left">
                <div className="pw-modal-avatar-wrap">
                  <div className="pw-modal-avatar-halo" aria-hidden="true" />
                  <img
                    className="pw-modal-avatar-img"
                    src={modalTheme.portrait}
                    alt={modalChar.name}
                  />
                </div>
                <h2 className="pw-modal-char-name">{modalChar.name}</h2>
                <button
                  className="pw-chat-cta-btn"
                  onClick={() => {
                    setModalCharId(null);
                    onEnterChat(modalChar.id);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>与他聊聊</span>
                </button>
              </div>

              <div className="pw-char-modal-right">
                <p className="pw-modal-section-title">选择实验</p>
                <div className="pw-modal-exp-list">
                  {modalChar.experiments.map((eid) => {
                    const exp = boot.experimentMap[eid];
                    const subj = boot.subjects.find((s) => s.id === exp.subject);
                    return (
                      <div key={eid} className={`pw-modal-exp-card ${exp.available ? 'open' : 'soon'}`}>
                        <div style={{ minWidth: 0 }}>
                          <div className="pw-modal-exp-title-row">
                            <span className="pw-modal-exp-title">{exp.name}</span>
                            {subj && <span className="pw-modal-exp-subj">{subj.name}</span>}
                          </div>
                          <p className="pw-modal-exp-desc">{exp.summary}</p>
                        </div>
                        <button
                          className={`pw-pill-btn ${exp.available ? 'primary' : 'muted-btn'}`}
                          onClick={() => enterExperiment(eid, modalChar.id)}
                        >
                          {exp.available ? '进入实验' : '后续开放'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 全局轻提示 */}
      <div className={`pw-toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        <span>{toast?.text ?? ''}</span>
        {toast?.actionLabel && toast.onAction && (
          <button
            className="pw-toast-action"
            onClick={() => {
              const fn = toast.onAction;
              setToast(null);
              fn?.();
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
