import { useCallback, useEffect, useState } from 'react';
import type { CharacterId, ExperimentId } from '@pw/shared';
import { getBootstrap, type Bootstrap } from './api';
import Home from './pages/Home';
import Lab from './pages/Lab';
import ChatOnly from './pages/ChatOnly';

export type View =
  | { kind: 'home' }
  | { kind: 'lab'; experimentId: ExperimentId; characterId: CharacterId }
  | { kind: 'chat'; characterId: CharacterId };

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'home' });
  /** 任务完成状态。首版放内存，后面换成后端进度接口（PRD 4.2 任务进度由后端判题更新） */
  const [doneTaskIds, setDoneTaskIds] = useState<string[]>([]);

  useEffect(() => {
    getBootstrap()
      .then(setBoot)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const markDone = useCallback((taskId: string) => {
    setDoneTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
  }, []);

  if (error) {
    return (
      <div className="boot-state">
        <h1>连不上后端</h1>
        <p>{error}</p>
        <p className="muted">先确认 `pnpm dev:server` 已经起来了（默认 http://localhost:8787）。</p>
      </div>
    );
  }

  if (!boot) {
    return (
      <div className="boot-state">
        <div className="spinner" />
        <p className="muted">正在准备实验室…</p>
      </div>
    );
  }

  if (view.kind === 'lab') {
    return (
      <Lab
        boot={boot}
        experimentId={view.experimentId}
        characterId={view.characterId}
        doneTaskIds={doneTaskIds}
        onMarkDone={markDone}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }

  if (view.kind === 'chat') {
    return (
      <ChatOnly
        boot={boot}
        characterId={view.characterId}
        doneTaskIds={doneTaskIds}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }

  return (
    <Home
      boot={boot}
      doneTaskIds={doneTaskIds}
      onEnterLab={(experimentId, characterId) => setView({ kind: 'lab', experimentId, characterId })}
      onEnterChat={(characterId) => setView({ kind: 'chat', characterId })}
    />
  );
}
