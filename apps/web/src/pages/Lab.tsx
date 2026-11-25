import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnswerLevel,
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
} from '@pw/physics-core';
import ProjectileCanvas from '../components/ProjectileCanvas';
import PartnerDock from '../components/PartnerDock';
import { getTasks, judgeTask, type Bootstrap } from '../api';

interface Props {
  boot: Bootstrap;
  experimentId: ExperimentId;
  characterId: CharacterId;
  doneTaskIds: string[];
  onMarkDone: (taskId: string) => void;
  onBack: () => void;
}

export default function Lab({
  boot,
  experimentId,
  characterId,
  doneTaskIds,
  onMarkDone,
  onBack,
}: Props) {
  const character = boot.characters[characterId];
  const specs = boot.paramSpecs[experimentId] ?? [];

  const [params, setParams] = useState<ParamValues>(() => {
    const init: ParamValues = {};
    for (const s of specs) init[s.key] = s.default;
    return init;
  });
  const [t, setT] = useState(0);
  const [runState, setRunState] = useState<RunState>('idle');
  const [recentOps, setRecentOps] = useState<ControlOp[]>([]);
  const [tasks, setTasks] = useState<TaskPublic[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<{ task: TaskPublic } | null>(null);
  const [judged, setJudged] = useState<{ index: number; res: JudgeResponse } | null>(null);
  const [level, setLevel] = useState<AnswerLevel>('normal');
  const [guideRequest, setGuideRequest] = useState({ seq: 0, taskTitle: '' });

  const tRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const snapshotRef = useRef<ExperimentSnapshot | null>(null);

  const p = toProjectileParams(params);
  const result = computeProjectileResult(p);
  const T = flightTime(p);

  const setTime = (value: number) => {
    tRef.current = value;
    setT(value);
  };

  useEffect(() => {
    getTasks(experimentId).then(setTasks).catch(() => setTasks([]));
  }, [experimentId]);

  /* 动画：requestAnimationFrame 推进时间，落地即停 */
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

  /* 每次渲染后刷新快照，让 AI 看到最新的参数与运行状态 */
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

  const changeParam = (key: string, value: number) => {
    setParams((prev) => applyOpsToParams(prev, [{ type: 'setParam', key, value }]));
    pushOps([{ type: 'setParam', key, value }]);
    // 改参数会重置本轮（PRD 5.10 动画与数值同步）
    setTime(0);
    setRunState('idle');
  };

  const runControl = (type: 'start' | 'pause' | 'resume' | 'reset') => {
    pushOps([{ type }]);
    if (type === 'start') {
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

  /** AI 下发的操作与手动操作走同一个入口（PRD 5.5） */
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

  const activeTask = tasks.find((x) => x.id === activeTaskId) ?? null;

  const openQuiz = (task: TaskPublic) => {
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
        res: { correct: false, explain: `判题接口没接上：${e instanceof Error ? e.message : ''}` },
      });
    }
  };

  const stateText: Record<RunState, string> = {
    idle: '未开始',
    running: '运行中',
    paused: '已暂停',
    landed: '已落地',
  };

  return (
    <div className="lab">
      <header className="lab-head">
        <button className="link" onClick={onBack}>
          ← 返回首页
        </button>
        <div className="lab-title">
          <h1>{boot.experimentMap[experimentId].name}</h1>
          <span className="muted small">
            {boot.experimentMap[experimentId].summary} · 伙伴：{character.name}
          </span>
        </div>
        <span className={`run-badge ${runState}`}>{stateText[runState]}</span>
      </header>

      <div className="lab-grid">
        <section className="lab-stage">
          <ProjectileCanvas v0={p.v0} h={p.h} g={p.g} t={t} />

          <div className="readouts">
            <Readout label="时间 t" value={t.toFixed(2)} unit="s" />
            <Readout label="落地时间 T" value={result.flightTime.toFixed(2)} unit="s" />
            <Readout label="射程 L" value={result.range.toFixed(2)} unit="m" />
            <Readout
              label="落地速度"
              value={String(result.metrics.landingSpeed ?? '—')}
              unit="m/s"
            />
          </div>

          <div className="controls">
            {runState === 'running' ? (
              <button className="btn primary" onClick={() => runControl('pause')}>
                暂停
              </button>
            ) : runState === 'paused' ? (
              <button className="btn primary" onClick={() => runControl('resume')}>
                继续
              </button>
            ) : (
              <button className="btn primary" onClick={() => runControl('start')}>
                {runState === 'landed' ? '再抛一次' : '开始'}
              </button>
            )}
            <button className="btn" onClick={() => runControl('reset')}>
              重置
            </button>
            <span className="muted small">向上为正，地面 y = 0，忽略空气阻力。</span>
          </div>

          <div className="params">
            {specs.map((spec) => (
              <label key={spec.key} className="param">
                <span className="param-head">
                  <span>{spec.label}</span>
                  <span className="param-value">
                    {params[spec.key] ?? spec.default}
                    <em>{spec.unit}</em>
                  </span>
                </span>
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={params[spec.key] ?? spec.default}
                  onChange={(e) => changeParam(spec.key, Number(e.target.value))}
                />
                <span className="param-scale muted small">
                  {spec.min} – {spec.max} {spec.unit}
                </span>
              </label>
            ))}
          </div>
        </section>

        <aside className="lab-tasks">
          <h2>
            任务列表
            <span className="muted small">
              {tasks.filter((x) => doneTaskIds.includes(x.id)).length}/{tasks.length} 完成
            </span>
          </h2>

          <ul className="task-list">
            {tasks.map((task) => {
              const done = doneTaskIds.includes(task.id);
              return (
                <li
                  key={task.id}
                  className={`task-item ${activeTaskId === task.id ? 'active' : ''} ${done ? 'done' : ''}`}
                  onClick={() => setActiveTaskId(task.id)}
                >
                  <span className="task-dot">{done ? '✓' : ''}</span>
                  <div>
                    <strong>{task.title}</strong>
                    <p className="muted small">{task.goal}</p>
                  </div>
                  <span className="pill">{done ? '已完成' : activeTaskId === task.id ? '进行中' : '未完成'}</span>
                </li>
              );
            })}
          </ul>

          {activeTask && (
            <div className="task-detail">
              <h3>{activeTask.title}</h3>
              <p className="muted small">探索目标：{activeTask.goal}</p>
              <div className="task-actions">
                <button
                  className="btn sm"
                  onClick={() =>
                    setGuideRequest((prev) => ({ seq: prev.seq + 1, taskTitle: activeTask.title }))
                  }
                >
                  AI 引导
                </button>
                <button
                  className="btn primary sm"
                  disabled={doneTaskIds.includes(activeTask.id)}
                  onClick={() => openQuiz(activeTask)}
                >
                  {doneTaskIds.includes(activeTask.id) ? '已完成' : '完成任务'}
                </button>
              </div>
            </div>
          )}

          <p className="muted small tip">
            任务可以随便看，切换任务不会清掉你现在的实验。只有选择题答对才算完成。
          </p>
        </aside>
      </div>

      <PartnerDock
        character={character}
        level={level}
        onLevelChange={setLevel}
        taskId={activeTaskId ?? undefined}
        doneTaskIds={doneTaskIds}
        getSnapshot={getSnapshot}
        onOps={handleAgentOps}
        guideRequest={guideRequest}
      />

      {quiz && (
        <div className="modal-mask" onClick={() => setQuiz(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{quiz.task.title}</h3>
            <p className="quiz-stem">{quiz.task.question.stem}</p>
            <div className="options">
              {quiz.task.question.options.map((opt, i) => {
                const chosen = judged?.index === i;
                const correct = judged?.res.correct && chosen;
                return (
                  <button
                    key={i}
                    className={`option ${chosen ? (correct ? 'ok' : 'bad') : ''}`}
                    disabled={Boolean(judged?.res.correct)}
                    onClick={() => void submitAnswer(i)}
                  >
                    <span className="option-key">{String.fromCharCode(65 + i)}</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {judged && (
              <div className={`quiz-feedback ${judged.res.correct ? 'ok' : 'bad'}`}>
                <strong>{judged.res.correct ? '答对了' : '再想想'}</strong>
                <p>{judged.res.explain}</p>
                {judged.res.summary && <p className="muted small">{judged.res.summary}</p>}
              </div>
            )}

            <div className="modal-foot">
              {judged?.res.correct ? (
                <button className="btn primary sm" onClick={() => setQuiz(null)}>
                  收下这个知识点
                </button>
              ) : (
                <button className="btn ghost sm" onClick={() => setQuiz(null)}>
                  先去试试实验
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="readout">
      <span className="muted small">{label}</span>
      <span className="readout-value">
        {value}
        <em>{unit}</em>
      </span>
    </div>
  );
}
