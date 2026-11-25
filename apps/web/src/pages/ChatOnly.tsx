import { useState } from 'react';
import type { AnswerLevel, CharacterId } from '@pw/shared';
import ChatThread from '../components/ChatThread';
import type { Bootstrap } from '../api';

interface Props {
  boot: Bootstrap;
  characterId: CharacterId;
  doneTaskIds: string[];
  onBack: () => void;
}

export default function ChatOnly({ boot, characterId, doneTaskIds, onBack }: Props) {
  const character = boot.characters[characterId];
  const [level, setLevel] = useState<AnswerLevel>('normal');

  return (
    <div className="chat-page">
      <aside className="chat-page-side" style={{ borderColor: `${character.accent}40` }}>
        <button className="link" onClick={onBack}>
          ← 回到首页
        </button>
        <span className="char-avatar-lg" style={{ background: `${character.accent}1f` }}>
          {character.avatar}
        </span>
        <h2>{character.name}</h2>
        <p className="muted small">{character.nameEn}</p>
        <blockquote className="quote">
          “{character.quote}”
          <cite>{character.quoteSource}</cite>
        </blockquote>
        <dl className="char-facts">
          <dt>擅长</dt>
          <dd>{character.expertise}</dd>
          <dt>性格</dt>
          <dd>{character.personality}</dd>
          <dt>知识边界</dt>
          <dd>{character.boundaryNote}</dd>
        </dl>
        <p className="muted small">
          这是 AI 模拟的人物，不是历史本人。实验数据以计算引擎为准。
        </p>
      </aside>

      <main className="chat-page-main">
        <ChatThread
          character={character}
          feature="chat"
          level={level}
          onLevelChange={setLevel}
          doneTaskIds={doneTaskIds}
        />
      </main>
    </div>
  );
}
