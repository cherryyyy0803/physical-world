import type { CharacterId, SubjectId } from '@pw/contracts';

export interface CharacterTheme {
  portrait: string;
  accent: string;
  hover: string;
  soft: string;
  border: string;
  ink: string;
  domainShort: string;
  /** 首页悬停名言（胡克与托马斯·杨采用更具哲理与探索感的历史原话） */
  hoverQuote: string;
  /** 1v1 轻松聊天页状态与日常开场 */
  mood: string;
  greeting: string;
  starters: string[];
}

export const CHARACTER_THEMES: Record<CharacterId, CharacterTheme> = {
  galileo: {
    portrait: '/assets/galileo.png',
    accent: '#F2785C',
    hover: '#E06246',
    soft: '#FFF5F2',
    border: '#F8C9BD',
    ink: '#C94B30',
    domainShort: '落体 · 抛体 · 惯性与运动',
    hoverQuote: '自然之书是用数学语言写成的。',
    mood: '刚收起望远镜，随便聊聊',
    greeting:
      '嗨！别整天闷头写题啦，我刚从阳台收起望远镜。今天过得怎么样？想吐槽、闲聊或者问点稀奇古怪的都行～',
    starters: ['今天好累啊，求安慰', '你平时不搞科研都在干嘛？', '穿越到现代你最想玩什么？'],
  },
  hooke: {
    portrait: '/assets/hooke.png',
    accent: '#1FA885',
    hover: '#189172',
    soft: '#EFFBF6',
    border: '#B5E6D4',
    ink: '#14755C',
    domainShort: '弹性 · 形变与恢复力',
    hoverQuote: '探索自然最需要的，是一双真诚的手和一双忠实的眼睛。',
    mood: '正在工作台摆弄小零件',
    greeting:
      '哟，来啦？我刚修好一只怀表的游丝。不用拘束，喝杯咖啡随便聊——生活里的奇思妙想、手工小玩意或者今天遇到的怪事都可以跟我说！',
    starters: ['今天好累啊，求安慰', '你最得意的小发明是什么？', '伦敦的咖啡馆好玩吗？'],
  },
  young: {
    portrait: '/assets/young.png',
    accent: '#4663D9',
    hover: '#3550C4',
    soft: '#F1F4FE',
    border: '#C5D0F9',
    ink: '#2E46A8',
    domainShort: '光的干涉与波动说',
    hoverQuote: '敢于怀疑看似确定的答案，才能走向更高层次的真理。',
    mood: '刚泡好红茶，听听音乐',
    greeting:
      '你好呀，正好刚泡好一壶红茶。不用聊多严肃的课题，聊聊音乐、语言、今天的心情，或者任何让你好奇的小事，我都很乐意陪你慢慢说。',
    starters: ['今天好累啊，求安慰', '听说你还会破译古埃及文字？', '平时怎么平衡这么多兴趣？'],
  },
};

export interface SubjectTheme {
  color: string;
  bg: string;
}

export const SUBJECT_THEMES: Record<SubjectId, SubjectTheme> = {
  mechanics: { color: '#F2785C', bg: '#FFF2EE' },
  optics: { color: '#4663D9', bg: '#EEF1FD' },
  electromagnetism: { color: '#E5A032', bg: '#FFF6E6' },
};

export function getCharacterTheme(id: CharacterId): CharacterTheme {
  return CHARACTER_THEMES[id] ?? CHARACTER_THEMES.galileo;
}

export function getSubjectTheme(id: SubjectId): SubjectTheme {
  return SUBJECT_THEMES[id] ?? SUBJECT_THEMES.mechanics;
}
