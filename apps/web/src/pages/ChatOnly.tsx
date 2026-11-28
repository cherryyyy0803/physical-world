import { useState, type CSSProperties } from 'react';
import type { AnswerLevel, CharacterId } from '@pw/contracts';
import { CHARACTER_LIST } from '@pw/contracts';
import ChatThread from '../components/ChatThread';
import type { Bootstrap } from '../api';
import { getCharacterTheme } from '../theme';

interface Props {
  boot: Bootstrap;
  characterId: CharacterId;
  doneTaskIds: string[];
  onSwitchCharacter: (characterId: CharacterId) => void;
  onBack: () => void;
}

export default function ChatOnly({
  boot,
  characterId,
  doneTaskIds,
  onSwitchCharacter,
  onBack,
}: Props) {
  const character = boot.characters[characterId];
  const theme = getCharacterTheme(characterId);
  const [level, setLevel] = useState<AnswerLevel>('normal');

  const style = {
    '--chat-accent': theme.accent,
    '--chat-soft': theme.soft,
    '--chat-border': theme.border,
  } as CSSProperties;

  return (
    <div className="chat1v1-page" style={style}>
      <header className="chat1v1-header">
        <div className="chat1v1-header-left">
          <button className="hud-back" onClick={onBack} title="返回首页" aria-label="返回首页">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="chat1v1-who">
          <div className="chat1v1-name">{character.name}</div>
          <div className="chat1v1-mood">
            <span className="online-dot" />
            <span>{theme.mood}</span>
          </div>
        </div>

        <div className="chat1v1-switcher" title="切换聊天对象">
          {CHARACTER_LIST.map((c) => {
            const t = getCharacterTheme(c.id);
            return (
              <button
                key={c.id}
                className={`mini-char-switch ${c.id === characterId ? 'active' : ''}`}
                onClick={() => onSwitchCharacter(c.id)}
                title={c.name}
              >
                <img src={t.portrait} alt={c.name} />
              </button>
            );
          })}
        </div>
      </header>

      <div className="chat1v1-body">
        <ChatThread
          key={characterId}
          character={character}
          feature="chat"
          level={level}
          onLevelChange={setLevel}
          doneTaskIds={doneTaskIds}
          casualMode
        />
      </div>
    </div>
  );
}
