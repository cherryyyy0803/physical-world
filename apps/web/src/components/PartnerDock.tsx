import { memo, useEffect, useState } from 'react';
import type {
  AnswerLevel,
  ChallengeSpec,
  ChallengeVerifyResponse,
  Character,
  ControlOp,
  ExperimentSnapshot,
  PartnerFeature,
} from '@pw/contracts';
import { generateChallenge, verifyChallengeRequest } from '../api';
import ChatThread from './ChatThread';

interface Props {
  character: Character;
  level: AnswerLevel;
  onLevelChange: (level: AnswerLevel) => void;
  taskId?: string;
  doneTaskIds: string[];
  getSnapshot: () => ExperimentSnapshot | undefined;
  onOps: (ops: ControlOp[], reply: string) => void;
  /** 任务列表点「AI 引导」时递增，用来打开面板并发起提问 */
  guideRequest: { seq: number; taskTitle: string };
}

const MENU: Array<{ key: PartnerFeature; label: string; icon: string }> = [
  { key: 'chat', label: '聊天 / 控制实验', icon: '💬' },
  { key: 'suggest', label: '探索建议', icon: '🧭' },
  { key: 'challenge', label: '挑战任务', icon: '🎯' },
  { key: 'review', label: '知识回顾', icon: '📖' },
];

function PartnerDock({
  character,
  level,
  onLevelChange,
  taskId,
  doneTaskIds,
  getSnapshot,
  onOps,
  guideRequest,
}: Props) {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<PartnerFeature>('chat');
  const [prompt, setPrompt] = useState<{
    content: string;
    display: string;
    tag: string;
    seq: number;
  } | null>(null);
  const [seq, setSeq] = useState(0);

  const [challenge, setChallenge] = useState<ChallengeSpec | null>(null);
  const [verify, setVerify] = useState<ChallengeVerifyResponse | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [doneChallenges, setDoneChallenges] = useState<string[]>([]);

  const firePrompt = (content: string, display: string, tag: string) => {
    const next = seq + 1;
    setSeq(next);
    setPrompt({ content, display, tag, seq: next });
  };

  /* 任务列表点「AI 引导」：打开面板，用同一个人物给提示（PRD 5.4） */
  useEffect(() => {
    if (guideRequest.seq === 0) return;
    setOpen(true);
    setFeature('chat');
    firePrompt(
      `我在「${guideRequest.taskTitle}」这个任务上卡住了，请给我一条可以直接动手试的提示，先不要告诉我答案。`,
      `我在「${guideRequest.taskTitle}」上卡住了，给我点提示`,
      'AI 引导',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideRequest.seq]);

  const pick = async (key: PartnerFeature) => {
    setFeature(key);
    setVerify(null);
    if (key === 'suggest') {
      firePrompt('给我 1—2 个新的探索方向。', '有什么可以继续探究的？', '探索建议');
    } else if (key === 'review') {
      firePrompt(
        '根据我完成的任务和当前参数，帮我做个知识回顾。',
        '帮我总结一下现在掌握的规律',
        '知识回顾',
      );
    } else if (key === 'challenge') {
      setChallengeLoading(true);
      try {
        const c = await generateChallenge(doneChallenges);
        setChallenge(c);
      } catch {
        setChallenge(null);
      } finally {
        setChallengeLoading(false);
      }
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

  if (!open) {
    return (
      <button
        className="dock-fab"
        style={{ background: character.accent }}
        onClick={() => setOpen(true)}
        title={`和${character.name}一起`}
      >
        <span>{character.avatar}</span>
      </button>
    );
  }

  return (
    <aside className="dock">
      <header className="dock-head" style={{ borderColor: character.accent }}>
        <span className="dock-avatar" style={{ background: `${character.accent}1f` }}>
          {character.avatar}
        </span>
        <div className="dock-title">
          <strong>{character.name}</strong>
          <span className="muted small">{character.expertise}</span>
        </div>
        <button className="icon-btn" onClick={() => setOpen(false)} title="收起（对话会保留）">
          ✕
        </button>
      </header>

      <nav className="dock-menu">
        {MENU.map((m) => (
          <button
            key={m.key}
            className={feature === m.key ? 'on' : ''}
            onClick={() => void pick(m.key)}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </nav>

      <div className="dock-body">
        <div
          className="challenge-pane"
          style={{ display: feature === 'challenge' ? 'block' : 'none' }}
        >
          <div className="challenge-card">
            {challengeLoading && <p className="muted">正在生成挑战…</p>}
            {!challengeLoading && !challenge && (
              <p className="muted">挑战模板没取到，先用固定关试试？</p>
            )}
            {challenge && (
              <>
                <h4>{challenge.title}</h4>
                <p className="challenge-goal">{challenge.goal}</p>
                <ul className="challenge-meta">
                  <li>
                    <span className="muted">固定条件</span>
                    {challenge.fixedDesc}
                  </li>
                  <li>
                    <span className="muted">可改参数</span>
                    {challenge.editable.includes('v0') ? '初速度 v₀' : challenge.editable.join('、')}
                  </li>
                  <li>
                    <span className="muted">判定标准</span>
                    {challenge.target.label}落在 {challenge.target.min}–{challenge.target.max}{' '}
                    {challenge.target.unit}
                  </li>
                </ul>
                <div className="challenge-actions">
                  <button className="btn primary sm" onClick={() => void submitChallenge()}>
                    提交挑战
                  </button>
                  <button
                    className="btn ghost sm"
                    onClick={() =>
                      firePrompt(
                        `我在做「${challenge.title}」这个挑战：${challenge.goal}。别告诉我答案，给我一个思路方向。`,
                        `挑战「${challenge.title}」该往哪个方向想？`,
                        '挑战提示',
                      )
                    }
                  >
                    问个思路
                  </button>
                </div>
                {verify && (
                  <p className={`challenge-result ${verify.pass ? 'ok' : 'fail'}`}>
                    {verify.pass ? '✅ ' : '❌ '}
                    {verify.message}
                  </p>
                )}
                <p className="muted small">
                  判定由程序完成，界面显示的数值就是判定依据。
                </p>
              </>
            )}
          </div>
        </div>

        <div
          className="chat-pane"
          style={{ display: feature === 'challenge' ? 'none' : 'flex' }}
        >
          <ChatThread
            character={character}
            feature={feature}
            level={level}
            onLevelChange={onLevelChange}
            taskId={taskId}
            doneTaskIds={doneTaskIds}
            getSnapshot={getSnapshot}
            onOps={onOps}
            autoPrompt={prompt}
          />
        </div>
      </div>
    </aside>
  );
}

export default memo(PartnerDock);
