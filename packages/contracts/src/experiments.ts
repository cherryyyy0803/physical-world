import type { CharacterId, ExperimentId } from './contract';
import { DEFAULT_CHARACTER_BY_EXPERIMENT } from './characters';

export type SubjectId = 'mechanics' | 'optics' | 'electromagnetism';

export interface Subject {
  id: SubjectId;
  name: string;
  icon: string;
  summary: string;
}

export const SUBJECTS: Subject[] = [
  { id: 'mechanics', name: '力学', icon: '🎯', summary: '运动的规律：抛体、振动' },
  { id: 'optics', name: '光学', icon: '🌈', summary: '光的本性与干涉' },
  { id: 'electromagnetism', name: '电磁学', icon: '⚡', summary: '后续开放' },
];

export interface ExperimentMeta {
  id: ExperimentId;
  name: string;
  subject: SubjectId;
  summary: string;
  /** 未上线的实验显示「后续开放」，不允许进入空白页（PRD 5.2） */
  available: boolean;
  /** 该实验的默认人物（知识主题入口进入时自动使用） */
  characterId: CharacterId;
}

export const EXPERIMENTS: Record<ExperimentId, ExperimentMeta> = {
  projectile: {
    id: 'projectile',
    name: '平抛运动',
    subject: 'mechanics',
    summary: '把小球水平抛出，看它落在哪里、什么时候落地。',
    available: true,
    characterId: DEFAULT_CHARACTER_BY_EXPERIMENT.projectile,
  },
  spring: {
    id: 'spring',
    name: '弹簧振子',
    subject: 'mechanics',
    summary: '挂一个重物在弹簧上，观察它来回振动的快慢。',
    available: false,
    characterId: DEFAULT_CHARACTER_BY_EXPERIMENT.spring,
  },
  'double-slit': {
    id: 'double-slit',
    name: '双缝干涉',
    subject: 'optics',
    summary: '让光穿过两条细缝，看屏幕上出现明暗相间的条纹。',
    available: false,
    characterId: DEFAULT_CHARACTER_BY_EXPERIMENT['double-slit'],
  },
};

export const EXPERIMENT_LIST: ExperimentMeta[] = Object.values(EXPERIMENTS);

export function experimentsOfSubject(subject: SubjectId): ExperimentMeta[] {
  return EXPERIMENT_LIST.filter((e) => e.subject === subject);
}
