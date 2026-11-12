import type { Draw, Member, Participant, TaskDetail } from '../../../src/shared/contracts';

export type Editor =
  | { kind: 'task'; task?: TaskDetail }
  | { kind: 'person'; person?: Participant }
  | { kind: 'remove-person'; person: Participant }
  | { kind: 'member'; task: TaskDetail }
  | { kind: 'correction'; task: TaskDetail; member: Member }
  | { kind: 'archive'; task: TaskDetail }
  | { kind: 'undo'; task: TaskDetail; draw: Draw };
