import { EventEmitter } from "node:events";
import type { LogStream as LogKind } from "../types";

export interface ProjectLogEvent {
  projectId: string;
  stream: LogKind;
  line: string;
  createdAt: string;
}

export class LogStreamService {
  private readonly emitter = new EventEmitter();

  publish(event: ProjectLogEvent): void {
    this.emitter.emit(event.projectId, event);
  }

  subscribe(
    projectId: string,
    listener: (event: ProjectLogEvent) => void
  ): () => void {
    this.emitter.on(projectId, listener);
    return () => {
      this.emitter.off(projectId, listener);
    };
  }
}

