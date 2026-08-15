import { flattenHunks, parseDiffBody, type DiffLine, type FileDiff } from '@lopr/core';

export type DiffViewLine = DiffLine;

export interface DiffViewFile {
  path: string;
  status: FileDiff['status'];
  additions: number;
  deletions: number;
  binary: boolean;
  lines: DiffViewLine[];
}

export function diffViewFiles(files: FileDiff[]): DiffViewFile[] {
  return files.map((file) => ({
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    lines: file.binary ? [] : flattenHunks(parseDiffBody(file.body).hunks),
  }));
}
