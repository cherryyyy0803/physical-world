import { useMemo, useState } from 'react';
import type { Character, CharacterId, ExperimentId } from '@pw/contracts';
import { CHARACTER_LIST, experimentsOfSubject, type SubjectId } from '@pw/contracts';
import type { Bootstrap } from '../api';

interface Props {
  boot: Bootstrap;
  doneTaskIds: string[];
  onEnterLab: (experimentId: ExperimentId, characterId: CharacterId) => void;
  onEnterChat: (characterId: CharacterId) => void;
}

type Mode = 'character' | 'subject';

export default function Home({ boot, doneTaskIds, onEnterLab, onEnterChat }: Props) {
  const [mode, setMode] = useState<Mode>('character');
  const [query, setQuery] = useState('');
  const [selectedChar, setSelectedChar] = useState<CharacterId | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2600);
  };

  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();

  const matchedChars = useMemo(
    () =>
      CHARACTER_LIST.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.nameEn.toLowerCase().includes(q) ||
          c.expertise.toLowerCase().includes(q),
      ),
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

  const character = selectedChar ? boot.characters[selectedChar] : null;
  const subjectExperiments = selectedSubject ? experimentsOfSubject(selectedSubject) : [];

  const enterExperiment = (experimentId: ExperimentId, characterId?: CharacterId) => {
    const target = boot.experimentMap[experimentId];
    if (!target.available) {
      say(`「${target.name}」还在制作中，等上线了会第一时间放开。`);
      return;
    }
    onEnterLab(experimentId, characterId ?? boot.defaultCharacter[experimentId]);
  };

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <div className="brand">
            <span className="brand-dot" />
            物理世界
          </div>
          <p className="muted">挑一位物理学家，或挑一个知识点，然后自己动手做实验。</p>
        </div>
        <div className="home-tools">
          <div className="mode-switch" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'character'}
              className={mode === 'character' ? 'on' : ''}
              onClick={() => setMode('character')}
            >
              人物
            </button>
            <button
              role="tab"
              aria-selected={mode === 'subject'}
              className={mode === 'subject' ? 'on' : ''}
              onClick={() => setMode('subject')}
            >
              知识主题
            </button>
          </div>
          <input
            className="search"
            placeholder="搜人物姓名或实验名称…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      {searching ? (
        <section className="section">
          <h2>搜索结果</h2>
          {matchedChars.length === 0 && matchedExperiments.length === 0 && (
            <p className="muted">没找到对应的内容，换个关键词试试。</p>
          )}
          <div className="result-list">
            {matchedChars.map((c) => (
              <button key={c.id} className="result-row" onClick={() => onEnterChat(c.id)}>
                <span className="result-avatar">{c.avatar}</span>
                <span className="result-main">
                  <strong>{c.name}</strong>
                  <span className="muted">{c.nameEn} · 人物</span>
                </span>
                <span className="pill">可直接聊天</span>
              </button>
            ))}
            {matchedExperiments.map((e) => (
              <button
                key={e.id}
                className="result-row"
                onClick={() => enterExperiment(e.id)}
                disabled={!e.available}
              >
                <span className="result-avatar">{e.available ? '🧪' : '🔒'}</span>
                <span className="result-main">
                  <strong>{e.name}</strong>
                  <span className="muted">
                    实验 · {boot.subjects.find((s) => s.id === e.subject)?.name}
                  </span>
                </span>
                <span className="pill">{e.available ? '可以开始' : '后续开放'}</span>
              </button>
            ))}
          </div>
        </section>
      ) : mode === 'character' ? (
        <section className="section">
          <h2>选一位物理学家</h2>
          <div className="char-grid">
            {CHARACTER_LIST.map((c) => (
              <CharacterCard
                key={c.id}
                character={c}
                boot={boot}
                active={selectedChar === c.id}
                onClick={() => setSelectedChar(selectedChar === c.id ? null : c.id)}
              />
            ))}
          </div>

          {character && (
            <div className="char-expand" style={{ borderColor: character.accent }}>
              <div className="char-expand-head">
                <span className="char-avatar-lg" style={{ background: `${character.accent}22` }}>
                  {character.avatar}
                </span>
                <div>
                  <h3>{character.name}</h3>
                  <p className="muted">
                    {character.expertise}
                    <span className="boundary-tag">知识边界 · {character.boundaryYear}</span>
                  </p>
                </div>
              </div>

              <div className="char-exp-list">
                {character.experiments.map((eid) => {
                  const exp = boot.experimentMap[eid];
                  return (
                    <div key={eid} className="char-exp-row">
                      <div>
                        <strong>{exp.name}</strong>
                        <span className="muted"> · {exp.summary}</span>
                      </div>
                      <button
                        className={exp.available ? 'btn primary' : 'btn ghost'}
                        disabled={!exp.available}
                        onClick={() => enterExperiment(eid, character.id)}
                      >
                        {exp.available ? '开始实验' : '后续开放'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="char-expand-foot">
                <span className="muted">不做实验也可以先聊两句。</span>
                <button className="btn" onClick={() => onEnterChat(character.id)}>
                  直接聊天
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="section">
          <h2>按知识主题找实验</h2>
          <div className="subject-grid">
            {boot.subjects.map((s) => {
              const exps = experimentsOfSubject(s.id);
              const open = exps.filter((e) => e.available).length;
              return (
                <button
                  key={s.id}
                  className={`subject-card ${selectedSubject === s.id ? 'on' : ''}`}
                  onClick={() => setSelectedSubject(selectedSubject === s.id ? null : s.id)}
                >
                  <span className="subject-icon">{s.icon}</span>
                  <strong>{s.name}</strong>
                  <span className="muted">{s.summary}</span>
                  <span className="pill">{open > 0 ? `${open} 个实验可开始` : '后续开放'}</span>
                </button>
              );
            })}
          </div>

          {selectedSubject && (
            <div className="exps-of-subject">
              <div className="exps-head">
                <h3>{boot.subjects.find((s) => s.id === selectedSubject)?.name}</h3>
                <button className="link" onClick={() => setSelectedSubject(null)}>
                  返回主题
                </button>
              </div>
              {subjectExperiments.length === 0 && (
                <p className="muted">这个主题暂时还没有实验，先看看力学？</p>
              )}
              {subjectExperiments.map((e) => (
                <div key={e.id} className="exp-row">
                  <div>
                    <strong>{e.name}</strong>
                    <p className="muted">{e.summary}</p>
                    <span className="muted small">
                      默认伙伴：{boot.characters[boot.defaultCharacter[e.id]].name}
                    </span>
                  </div>
                  <button
                    className={e.available ? 'btn primary' : 'btn ghost'}
                    disabled={!e.available}
                    onClick={() => enterExperiment(e.id)}
                  >
                    {e.available ? '进入实验' : '后续开放'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="home-foot">
        <div className="muted small">
          已完成 {doneTaskIds.length} 个任务 ·{' '}
          {boot.llmEnabled ? '模型已接入' : '演示模式（未配置模型密钥）'}
        </div>
        <button
          className="btn discuss"
          onClick={() => say('讨论室接口已经预留（/api/discuss），等 B 把多人讨论流程接进来。')}
        >
          讨论室 · 选 2–3 位物理学家
        </button>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function CharacterCard({
  character,
  boot,
  active,
  onClick,
}: {
  character: Character;
  boot: Bootstrap;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const show = hover || active;

  return (
    <button
      className={`char-card ${active ? 'active' : ''}`}
      style={{ borderColor: active ? character.accent : undefined }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <span className="char-avatar" style={{ background: `${character.accent}1f` }}>
        {character.avatar}
      </span>
      <strong className="char-name">{character.name}</strong>
      <span className="char-quote">“{character.quote}”</span>
      <span className={`char-hint ${show ? 'show' : ''}`}>
        {character.experiments
          .map((e) => boot.experimentMap[e].name)
          .join(' · ')}
      </span>
    </button>
  );
}
