export interface Student {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  level: string;
  pattern: string;
  ownerId: string;
}

export interface Session {
  id: string;
  studentId: string;
  num: number;
  date: string;
  reaction: string;
  next: string;
  techniques: string[];
  aiSummary: string;
  mode: 'voice' | 'text';
  ownerId: string;
}

export type TabType = 'list' | 'session' | 'manage';
