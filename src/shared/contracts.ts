export interface Participant {
  id: number;
  name: string;
  createdAt: string;
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
}
export interface Member {
  id: number;
  participantId: number;
  name: string;
  active: boolean;
  count: number;
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
  method: 'random' | 'direct';
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
