import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  AnswerLevel,
  ChallengeSpec,
  ChallengeVerifyResponse,
  CharacterId,
  ControlOp,
  ExperimentId,
  ExperimentSnapshot,
  JudgeResponse,
  ParamValues,
  RunState,
  TaskPublic,
} from '@pw/contracts';
import {
  applyOps as applyOpsToParams,
  computeProjectileResult,
  flightTime,
  toProjectileParams,
  trajectory,
  type ProjectileSample,
} from '@pw/physics-core';
import ProjectileCanvas from '../components/ProjectileCanvas';
import ChatThread from '../components/ChatThread';
import {
  generateChallenge,
  getTasks,
  judgeTask,
  verifyChallengeRequest,
  type Bootstrap,
} from '../api';
import { getCharacterTheme } from '../theme';

interface Props {
  boot: Bootstrap;
  experimentId: ExperimentId;
  characterId: CharacterId;
  doneTaskIds: string[];
  onMarkDone: (taskId: string) => void;
  onBack: () => void;
}

type PanelKey = 'quest' | 'challenge' | 'suggest' | 'review' | 'chat' | null;

const SUGGESTIONS = [
  {
    title: '登月空投大冒险',
    question: '把重力加速度切到月球（1.6 m/s²），同样的空投箱能飞出多远？',
    action: '点击重力卡片里的「月球 1.6」，欣赏星空月球实景并重新开始！',
  },
  {
    title: '条条大路落同一点',
    question: '能否同时改变飞行高度 h 和飞机速度 v₀，让物资落在几乎相同的位置？',
    action: '勾选「对比上次轨迹」，拖动飞机升到更高后再调整速度试试看。',
  },
];

const LAB_QUICK_PROMPTS = [
  { label: '速度22 高度40', text: '把初速度调到 22，高度设为 40' },
  { label: '切到月球重力', text: '把重力设为 1.6' },
  { label: '落地时间与什么有关？', text: '落地时间和什么有关？' },
];

export default function Lab({
  boot,
  experimentId,
  characterId,
  doneTaskIds,
  onMarkDone,
  onBack,
}: Props) {
  const character = boot.characters[characterId];
  const theme = getCharacterTheme(characterId);
  const specs = boot.paramSpecs[experimentId] ?? [];

  const [params, setParams] = useState<ParamValues>(() => {
    const init: ParamValues = {};
    for (const s of specs) init[s.key] = s.default;
    return init;
  });
  const [t, setT] = useState(0);
  const [runState, setRunState] = useState<RunState>('idle');
  const [recentOps, setRecentOps] = useState<ControlOp[]>([]);
  const [ghostPoints, setGhostPoints] = useState<ProjectileSample[] | null>(null);
  const [showGhost, setShowGhost] = useState(true);

  const [tasks, setTasks] = useState<TaskPublic[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<{ task: TaskPublic } | null>(null);
  const [judged, setJudged] = useState<{ index: number; res: JudgeResponse } | null>(null);

  // 右上角五个圆形图标弹层状态
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);
  const [level, setLevel] = useState<AnswerLevel>('normal');
  const [autoPrompt, setAutoPrompt] = useState<{
    content: string;
    display: string;
    seq: number;
  } | null>(null);
  const [suggestIdx, setSuggestIdx] = useState(0);

  // 挑战状态（接真实后端 generateChallenge / verifyChallengeRequest）
  const [challenge, setChallenge] = useState<ChallengeSpec | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [verify, setVerify] = useState<ChallengeVerifyResponse | null>(null);
  const [doneChallenges, setDoneChallenges] = useState<string[]>([]);

  const tRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const snapshotRef = useRef<ExperimentSnapshot | null>(null);

  const p = toProjectileParams(params);
  const result = computeProjectileResult(p);

  const setTime = (value: number) => {
    tRef.current = value;
    setT(value);
  };

  useEffect(() => {
    getTasks(experimentId)
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [experimentId]);

  /* 点击页面空白处关闭右上角弹层 */
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.hud-popover') && !target.closest('.hud-icon-group')) {
        setOpenPanel(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  /* 动画推进：落地即停 */
  useEffect(() => {
    if (runState !== 'running') return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const limit = flightTime(toProjectileParams(paramsRef.current));
      const next = Math.min(tRef.current + dt, limit);
      tRef.current = next;
      setT(next);
      if (next >= limit) {
        setRunState('landed');
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runState]);

  useEffect(() => {
    snapshotRef.current = {
      experimentId,
      params,
      runState,
      t,
      result,
      recentOps,
    };
  });

  const getSnapshot = useMemo(() => () => snapshotRef.current ?? undefined, []);

  const pushOps = (ops: ControlOp[]) => {
    setRecentOps((prev) => [...prev, ...ops].slice(-12));
  };

  const saveGhostIfMoved = () => {
    if (tRef.current > 0.05) {
      setGhostPoints(trajectory(toProjectileParams(paramsRef.current), 90));
    }
  };

  const changeParam = (key: string, value: number) => {
    if (!Number.isFinite(value)) return;
    const spec = specs.find((s) => s.key === key);
    const maxCap = key === 'h' ? Math.min(spec?.max ?? 70, 70) : spec?.max ?? value;
    const clamped = spec ? Math.min(maxCap, Math.max(spec.min, value)) : value;
    saveGhostIfMoved();
    setParams((prev) => applyOpsToParams(prev, [{ type: 'setParam', key, value: clamped }]));
    pushOps([{ type: 'setParam', key, value: clamped }]);
    setTime(0);
    setRunState('idle');
  };

  const runControl = (type: 'start' | 'pause' | 'resume' | 'reset') => {
    pushOps([{ type }]);
    if (type === 'start') {
      saveGhostIfMoved();
      setTime(0);
      setRunState('running');
    } else if (type === 'pause') {
      setRunState('paused');
    } else if (type === 'resume') {
      setRunState('running');
    } else {
      setTime(0);
      setRunState('idle');
    }
  };

  const handleAgentOps = useCallback((ops: ControlOp[], _reply: string) => {
    const paramOps = ops.filter(
      (o): o is Extract<ControlOp, { type: 'setParam' }> => o.type === 'setParam',
    );
    const rest = ops.filter((o) => o.type !== 'setParam');

    if (paramOps.length > 0) {
      setParams((prev) => applyOpsToParams(prev, paramOps));
      setRecentOps((prev) => [...prev, ...paramOps].slice(-12));
      tRef.current = 0;
      setT(0);
      setRunState('idle');
    }

    if (rest.length > 0) setRecentOps((prev) => [...prev, ...rest].slice(-12));
    for (const op of rest) {
      if (op.type === 'start') {
        tRef.current = 0;
        setT(0);
        setRunState('running');
      } else if (op.type === 'pause') {
        setRunState('paused');
      } else if (op.type === 'resume') {
        setRunState('running');
      } else if (op.type === 'reset') {
        tRef.current = 0;
        setT(0);
        setRunState('idle');
      }
    }
  }, []);

  const loadChallenge = async () => {
    setChallengeLoading(true);
    setVerify(null);
    try {
      const c = await generateChallenge(doneChallenges);
      setChallenge(c);
    } catch {
      setChallenge(null);
    } finally {
      setChallengeLoading(false);
    }
  };

  const togglePanel = (key: Exclude<PanelKey, null>) => {
    const next = openPanel === key ? null : key;
    setOpenPanel(next);
    if (next === 'challenge' && !challenge && !challengeLoading) {
      void loadChallenge();
    }
  };

  const submitChallenge = async () => {
    const snapshot = getSnapshot();
    if (!challenge || !snapshot) return;
    try {
      const res = await verifyChallengeRequest(challenge, snapshot.params);
      setVerify(res);
      if (res.pass && !doneChallenges.includes(challenge.id)) {
        setDoneChallenges((prev) => [...prev, challenge.id]);
      }
    } catch (e) {
      setVerify({
        pass: false,
        actual: Number.NaN,
        message: `判定接口没接上：${e instanceof Error ? e.message : '未知错误'}`,
      });
    }
  };

  const openQuiz = (task: TaskPublic) => {
    setOpenPanel(null);
    setQuiz({ task });
    setJudged(null);
  };

  const submitAnswer = async (index: number) => {
    if (!quiz) return;
    try {
      const res = await judgeTask(quiz.task.id, index);
      setJudged({ index, res });
      if (res.correct) onMarkDone(quiz.task.id);
    } catch (e) {
      setJudged({
        index,
        res: {
          correct: false,
          explain: `判题接口没接上：${e instanceof Error ? e.message : ''}`,
        },
      });
    }
  };

  const curX = p.v0 * t;
  const curY = Math.max(0, p.h - 0.5 * p.g * t * t);
  const curV = Math.hypot(p.v0, p.g * t);
  const doneCount = tasks.filter((x) => doneTaskIds.includes(x.id)).length;
  const currentSug = SUGGESTIONS[suggestIdx] ?? {
    title: '换个角度看平抛',
    question: '试试同时改变初速度和高度，观察落地时间和射程。',
    action: '调整参数后重新发射，比较两次结果。',
  };

  const labThemeStyle = {
    '--lab-accent': theme.accent,
    '--lab-hover': theme.hover,
    '--lab-soft': theme.soft,
    '--lab-border': theme.border,
    '--lab-ink': theme.ink,
    '--chat-accent': theme.accent,
    '--chat-soft': theme.soft,
    '--chat-border': theme.border,
  } as CSSProperties;

  return (
    <div className="game-shell" style={labThemeStyle}>
      {/* 顶部 HUD 栏：左极简圆形返回箭头+实验名+学科，右五个圆形功能图标 */}
      <header className="hud-top">
        <div className="hud-left">
          <button className="hud-back" onClick={onBack} title="返回首页" aria-label="返回首页">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <div className="hud-title-wrap">
            <h1 className="hud-title">{boot.experimentMap[experimentId].name}</h1>
            <span className="hud-badge">
              {boot.subjects.find((s) => s.id === boot.experimentMap[experimentId].subject)?.name ?? '力学'}
            </span>
          </div>
        </div>

        <div className="hud-right">
          <div className="hud-icon-group">
            <button
              className={`hud-circle-btn ic-quest ${openPanel === 'quest' ? 'active' : ''}`}
              data-tooltip="任务"
              aria-label="任务"
              onClick={() => togglePanel('quest')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span className="hud-mini-badge">
                {doneCount}/{tasks.length || 3}
              </span>
            </button>

            <button
              className={`hud-circle-btn ic-challenge ${openPanel === 'challenge' ? 'active' : ''}`}
              data-tooltip="挑战"
              aria-label="挑战"
              onClick={() => togglePanel('challenge')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </button>

            <button
              className={`hud-circle-btn ic-suggest ${openPanel === 'suggest' ? 'active' : ''}`}
              data-tooltip="探索建议"
              aria-label="探索建议"
              onClick={() => togglePanel('suggest')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            </button>

            <button
              className={`hud-circle-btn ic-review ${openPanel === 'review' ? 'active' : ''}`}
              data-tooltip="知识回顾"
              aria-label="知识回顾"
              onClick={() => togglePanel('review')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>

            <button
              className={`hud-circle-btn ic-galileo ${openPanel === 'chat' ? 'active' : ''}`}
              data-tooltip={character.name}
              aria-label={character.name}
              onClick={() => togglePanel('chat')}
            >
              <img src={theme.portrait} alt={character.name} />
            </button>
          </div>

          {/* 弹层 1：任务 */}
          <div
            className={`hud-popover ${openPanel === 'quest' ? 'open' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hud-popover-pad">
              <div className="quest-pop-head">
                <h3>任务</h3>
                <button className="close-circle" onClick={() => setOpenPanel(null)} aria-label="收起">
                  ×
                </button>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0}%` }}
                />
              </div>
              <div className="pw-task-list">
                {tasks.map((task) => {
                  const isActive = activeTaskId === task.id;
                  const isDone = doneTaskIds.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      className={`pw-task-card ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                      onClick={() => setActiveTaskId(isActive ? null : task.id)}
                    >
                      <div className="pw-task-row">
                        <span className="pw-task-check">{isDone ? '✓' : ''}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="pw-task-title">{task.title}</div>
                          <p className="pw-task-goal">{task.goal}</p>
                        </div>
                      </div>
                      {isActive && (
                        <div className="pw-task-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="pw-btn pw-btn-sm"
                            onClick={() => {
                              setOpenPanel('chat');
                              setAutoPrompt((prev) => ({
                                seq: (prev?.seq ?? 0) + 1,
                                content: `我在「${task.title}」这个任务上卡住了，请给我一条可以直接动手试的提示，先不要告诉我答案。`,
                                display: `我在「${task.title}」上卡住了，给我点提示`,
                              }));
                            }}
                          >
                            AI 引导
                          </button>
                          <button
                            className="pw-btn pw-btn-launch pw-btn-sm"
                            style={{ width: 'auto', height: 32 }}
                            onClick={() => openQuiz(task)}
                          >
                            {isDone ? '重看题目' : '完成任务'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 弹层 2：挑战 */}
          <div
            className={`hud-popover ${openPanel === 'challenge' ? 'open' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hud-popover-pad">
              <div className="quest-pop-head">
                <h3>挑战</h3>
                <button className="close-circle" onClick={() => setOpenPanel(null)} aria-label="收起">
                  ×
                </button>
              </div>
              <div className="pw-info-card">
                {challengeLoading && <p style={{ margin: 0 }}>正在生成挑战…</p>}
                {!challengeLoading && !challenge && (
                  <p style={{ margin: 0 }}>
                    挑战模板暂时没取到，请确认后端服务已启动。
                    <button className="pw-text-btn" onClick={() => void loadChallenge()}>
                      重试
                    </button>
                  </p>
                )}
                {!challengeLoading && challenge && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <h4 style={{ margin: 0 }}>{challenge.title}</h4>
                      {doneChallenges.includes(challenge.id) && (
                        <span className="hud-badge">已通过</span>
                      )}
                    </div>
                    <p>{challenge.goal}</p>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                      固定条件：{challenge.fixedDesc}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="pw-btn pw-btn-launch pw-btn-sm"
                        style={{ width: 'auto', height: 32 }}
                        onClick={() => void submitChallenge()}
                      >
                        提交验证
                      </button>
                      <button
                        className="pw-btn pw-btn-sm"
                        onClick={() => {
                          setOpenPanel('chat');
                          setAutoPrompt((prev) => ({
                            seq: (prev?.seq ?? 0) + 1,
                            content: `我在做「${challenge.title}」这个挑战：${challenge.goal}。别告诉我答案，给我一个思路方向。`,
                            display: `挑战「${challenge.title}」该往哪个方向想？`,
                          }));
                        }}
                      >
                        问思路
                      </button>
                      <button className="pw-btn pw-btn-sm" onClick={() => void loadChallenge()}>
                        换一题
                      </button>
                    </div>
                    {verify && (
                      <div className={`pw-challenge-fb ${verify.pass ? 'ok' : 'fail'}`}>
                        {verify.message}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 弹层 3：探索建议 */}
          <div
            className={`hud-popover ${openPanel === 'suggest' ? 'open' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hud-popover-pad">
              <div className="quest-pop-head">
                <h3>探索建议</h3>
                <button className="close-circle" onClick={() => setOpenPanel(null)} aria-label="收起">
                  ×
                </button>
              </div>
              <div className="pw-info-card">
                <h4>{currentSug.title}</h4>
                <p>{currentSug.question}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>{currentSug.action}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="pw-btn pw-btn-launch pw-btn-sm"
                    style={{ width: 'auto', height: 32 }}
                    onClick={() => setOpenPanel(null)}
                  >
                    去试试
                  </button>
                  <button
                    className="pw-btn pw-btn-sm"
                    onClick={() => setSuggestIdx((i) => (i + 1) % SUGGESTIONS.length)}
                  >
                    换一个
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 弹层 4：知识回顾 */}
          <div
            className={`hud-popover ${openPanel === 'review' ? 'open' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hud-popover-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="quest-pop-head" style={{ marginBottom: 2 }}>
                <h3>知识回顾</h3>
                <button className="close-circle" onClick={() => setOpenPanel(null)} aria-label="收起">
                  ×
                </button>
              </div>
              <div className="pw-info-card">
                <h4>
                  基础探索进度（{doneCount} / {tasks.length}）
                </h4>
                {tasks.map((tk) => (
                  <div
                    key={tk.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--line)',
                      fontSize: 13,
                    }}
                  >
                    <span>{tk.title}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: doneTaskIds.includes(tk.id) ? theme.ink : 'var(--muted)',
                      }}
                    >
                      {doneTaskIds.includes(tk.id) ? '已掌握' : '待探索'}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-sub)' }}>
                  独立挑战通过：<strong>{doneChallenges.length}</strong> 项
                </div>
              </div>
              <div className="pw-info-card">
                <h4>平抛运动核心公式</h4>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.85 }}>
                  x = v₀ · t
                  <br />
                  y = h − 0.5 · g · t²
                  <br />
                  T = √(2h / g) &nbsp;&nbsp; L = v₀ · T
                </div>
              </div>
            </div>
          </div>

          {/* 弹层 5：伽利略纯聊天框（保持挂载不丢历史） */}
          <div
            className={`hud-popover hud-chat-popover ${openPanel === 'chat' ? 'open' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pw-dock-head">
              <div className="pw-dock-head-left">
                <div className="pw-dock-avatar">
                  <img src={theme.portrait} alt={character.name} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{character.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>你的实验伙伴</div>
                </div>
              </div>
              <button className="close-circle" onClick={() => setOpenPanel(null)} aria-label="收起">
                ×
              </button>
            </div>
            <ChatThread
              character={character}
              feature="chat"
              level={level}
              onLevelChange={setLevel}
              taskId={activeTaskId ?? undefined}
              doneTaskIds={doneTaskIds}
              getSnapshot={getSnapshot}
              onOps={handleAgentOps}
              autoPrompt={autoPrompt}
              quickPrompts={LAB_QUICK_PROMPTS}
            />
          </div>
        </div>
      </header>

      {/* 中央全景水粉画布 */}
      <section className="stage-wrap">
        <ProjectileCanvas
          v0={p.v0}
          h={p.h}
          g={p.g}
          t={t}
          runState={runState}
          accentColor={theme.accent}
          ghostPoints={ghostPoints}
          showGhost={showGhost}
          onDragHeight={(nextH) => changeParam('h', nextH)}
          minH={5}
          maxH={70}
        />

        <div className="stage-hud-readouts">
          <div className="hud-pill">
            <span>时间 t</span>
            <b>{t.toFixed(2)}</b>
            <span>s</span>
          </div>
          <div className="hud-pill">
            <span>水平 x</span>
            <b>{curX.toFixed(1)}</b>
            <span>m</span>
          </div>
          <div className="hud-pill">
            <span>高度 y</span>
            <b>{curY.toFixed(1)}</b>
            <span>m</span>
          </div>
          <div className="hud-pill">
            <span>速度 v</span>
            <b>{curV.toFixed(1)}</b>
            <span>m/s</span>
          </div>
          <div className="hud-pill accent">
            <span>射程 L</span>
            <b>{result.range.toFixed(1)}</b>
            <span>m</span>
          </div>
          <div className="hud-pill accent">
            <span>落地 T</span>
            <b>{result.flightTime.toFixed(2)}</b>
            <span>s</span>
          </div>
        </div>

        <div className="stage-hud-right">
          <label className="stage-toggle-pill">
            <input
              type="checkbox"
              checked={showGhost}
              onChange={(e) => setShowGhost(e.target.checked)}
            />
            <span>对比上次轨迹</span>
          </label>
        </div>
      </section>

      {/* 底部控制区：等大「开始/重置」+ 滑块/键盘双输入参数 */}
      <section className="control-dock">
        <div className="play-cluster">
          {runState === 'running' ? (
            <button className="pw-btn pw-btn-launch" onClick={() => runControl('pause')}>
              暂停
            </button>
          ) : runState === 'paused' ? (
            <button className="pw-btn pw-btn-launch" onClick={() => runControl('resume')}>
              继续
            </button>
          ) : (
            <button className="pw-btn pw-btn-launch" onClick={() => runControl('start')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
              <span>{runState === 'landed' ? '重新开始' : '开始'}</span>
            </button>
          )}
          <button className="pw-btn pw-btn-reset-eq" onClick={() => runControl('reset')}>
            重置
          </button>
        </div>

        <div className="params-strip">
          {specs.map((spec) => {
            const val = params[spec.key] ?? spec.default;
            const maxCap = spec.key === 'h' ? Math.min(spec.max, 70) : spec.max;
            const label =
              spec.key === 'v0'
                ? '飞机速度 v₀'
                : spec.key === 'h'
                  ? '飞行高度 h'
                  : '重力加速度 g';
            return (
              <div key={spec.key} className="param-box">
                <div className="param-top">
                  <span className="param-label">{label}</span>
                  <label className="num-input-wrap">
                    <input
                      type="number"
                      className="num-input"
                      min={spec.min}
                      max={maxCap}
                      step={spec.step}
                      value={val}
                      onChange={(e) => changeParam(spec.key, Number(e.target.value))}
                    />
                    <span className="num-unit">{spec.unit}</span>
                  </label>
                </div>
                <input
                  type="range"
                  min={spec.min}
                  max={maxCap}
                  step={spec.step}
                  value={val}
                  onChange={(e) => changeParam(spec.key, Number(e.target.value))}
                />
                {spec.key === 'g' ? (
                  <div className="param-foot">
                    <button type="button" className="mini-preset" onClick={() => changeParam('g', 1.6)}>
                      月球 1.6
                    </button>
                    <button type="button" className="mini-preset" onClick={() => changeParam('g', 9.8)}>
                      地球 9.8
                    </button>
                    <button type="button" className="mini-preset" onClick={() => changeParam('g', 20)}>
                      强重力 20
                    </button>
                  </div>
                ) : (
                  <div className="param-foot">
                    <span>{spec.min}</span>
                    <span>{spec.key === 'h' ? '可拖动飞机或输入' : '可滑动或键盘输入'}</span>
                    <span>{maxCap}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 任务验证选择题弹窗 */}
      <div
        className={`pw-modal-backdrop ${quiz ? 'open' : ''}`}
        onClick={() => setQuiz(null)}
        aria-hidden={!quiz}
      >
        {quiz && (
          <div className="pw-quiz-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="hud-badge">任务验证 · {quiz.task.title}</span>
              <button className="close-circle" onClick={() => setQuiz(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{quiz.task.title}</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-sub)' }}>{quiz.task.question.stem}</p>
            <div className="pw-quiz-options">
              {quiz.task.question.options.map((opt, i) => {
                const chosen = judged?.index === i;
                const correct = judged?.res.correct && chosen;
                return (
                  <button
                    key={i}
                    className={`pw-quiz-opt ${chosen ? (correct ? 'ok' : 'bad') : ''}`}
                    disabled={Boolean(judged?.res.correct)}
                    onClick={() => void submitAnswer(i)}
                  >
                    <span className="pw-quiz-key">{String.fromCharCode(65 + i)}</span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
            {judged && (
              <div className={`pw-quiz-result ${judged.res.correct ? 'ok' : 'bad'}`}>
                <strong>{judged.res.correct ? '答对啦！任务已完成' : '再想想看'}</strong>
                <div style={{ marginTop: 4 }}>{judged.res.explain}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
