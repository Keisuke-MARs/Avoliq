export interface Board {
  id: string;
  name: string;
  position: number;
}

export interface Status {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
}

export interface Tag {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
}

export interface Task {
  id: string;
  boardId: string;
  statusId: string;
  title: string;
  contentMd: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** 付いているタグのid。tags.position 昇順(Rust側が保証する) */
  tagIds: string[];
}

export type View = "board" | "detail" | "switcher" | "settings";
