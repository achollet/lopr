import { parseDiffBody, type DiffLine, type FileDiff } from '@lopr/core';

/** One display line of a file diff, pre-parsed for the webview. */
export interface DiffViewLine {
  kind: DiffLine['kind'];
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface DiffViewFile {
  path: string;
  status: FileDiff['status'];
  additions: number;
  deletions: number;
  binary: boolean;
  lines: DiffViewLine[];
}

/** Serialize raw file diffs into lines the webview can render without re-parsing. */
export function diffViewFiles(files: FileDiff[]): DiffViewFile[] {
  return files.map((file) => ({
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    lines: file.binary
      ? []
      : parseDiffBody(file.body).hunks.flatMap((hunk) =>
          hunk.lines.map((line) => ({
            kind: line.kind,
            oldLine: line.oldLine,
            newLine: line.newLine,
            text: line.text,
          })),
        ),
  }));
}
