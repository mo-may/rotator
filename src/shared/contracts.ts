export interface Participant {
  id: number;
  name: string;
  createdAt: string;
  absences?: Absence[];
  absent?: boolean;
  availabilityVersion?: number;
}
export interface Absence {
  start: string;
  end: string;
}
export interface TaskSchedule {
  frequency: 'weekly' | 'monthly';
  startDate: string;
}
export interface ParticipantRemoval {
  id: number;
  name: string;
  removedAt: string;
}
export interface CreateTaskInput {
  name: string;
  description?: string;
  participantIds?: number[];
  schedule?: TaskSchedule | null;
}
export interface Member {
  id: number;
  participantId: number;
  name: string;
  active: boolean;
  count: number;
  absent?: boolean;
}
export interface CandidateSnapshot {
  membershipId: number;
  name: string;
  count: number;
}
export interface Draw {
  id: string;
  taskId: number;
  participantId: number;
  membershipId: number;
  name: string;
  method: 'random' | 'direct' | 'manual';
  countBefore: number;
  countAfter: number;
  candidates: CandidateSnapshot[];
  createdAt: string;
  undoneAt: string | null;
  resultVersion: number;
}
export interface AuditEvent {
  id: number;
  type: string;
  createdAt: string;
  description: string;
}
export interface TaskSummary {
  id: number;
  name: string;
  description: string;
  archived: boolean;
  version: number;
  activeCount: number;
  memberCount: number;
  currentDraw: Draw | null;
  schedule?: TaskSchedule | null;
  dueDate?: string | null;
  due?: boolean;
}
export interface TaskDetail extends TaskSummary {
  members: Member[];
  candidates: Member[];
  history: Draw[];
  events: AuditEvent[];
  canUndo: boolean;
}
export interface AppState {
  tasks: TaskSummary[];
  participants: Participant[];
}
export interface StatsParticipant {
  id: number;
  name: string;
  removed: boolean;
}
export interface StatsTask {
  id: number;
  name: string;
  archived: boolean;
}
export interface StatsEntry {
  id: number;
  participantId: number;
  taskId: number;
  active: boolean;
  count: number;
  selections: number;
  undoneSelections: number;
  lastSelectedAt: string | null;
}
export type StatsPeriod = 'all' | 'week' | 'month' | 'custom';
export interface StatsDateRange {
  start: string;
  end: string;
}
export interface Stats {
  period: StatsPeriod;
  from: string | null;
  to: string;
  startDate?: string;
  endDate?: string;
  participants: StatsParticipant[];
  tasks: StatsTask[];
  entries: StatsEntry[];
}
export interface AppConfig {
  timeZone: string;
}
export interface ApiError {
  error: { code: string; message: string };
}
export interface DrawResponse {
  draw: Draw;
  task: TaskDetail;
  replayed: boolean;
}
