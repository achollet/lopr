import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { FileDiff, Review } from '@lopr/core';
import { reduce, selectedAnchor, type Pane, type TuiState } from './state.js';
import { initialTuiState } from './state.js';

export interface TuiActions {
  postComment(file: string, line: number, body: string): Promise<Review>;
  approve(): Promise<Review>;
  requestChanges(): Promise<Review>;
  merge(cleanup: boolean): Promise<Review>;
  exportToFile(): Promise<string>;
}

export interface AppProps {
  review: Review;
  diff: FileDiff[];
  actions: TuiActions;
  onQuit: () => void;
}

const DIFF_KIND_COLOR = {
  added: 'green',
  removed: 'red',
  context: 'white',
} as const;

function FilesPane({ state }: { state: TuiState }): React.ReactElement {
  const active = state.pane === 'files';
  return (
    <Box flexDirection="column" width={28} borderStyle="round" borderColor={active ? 'cyan' : 'gray'}>
      <Text bold underline>
        Files
      </Text>
      {state.files.length === 0 ? (
        <Text dimColor>no changes</Text>
      ) : (
        state.files.map((file, i) => (
          <Text key={file.path} color={i === state.selectedFile ? 'cyan' : undefined}>
            {i === state.selectedFile ? '> ' : '  '}
            {file.path}
            <Text dimColor>
              {' '}
              +{file.additions} -{file.deletions}
            </Text>
          </Text>
        ))
      )}
    </Box>
  );
}

function DiffPane({ state }: { state: TuiState }): React.ReactElement {
  const active = state.pane === 'diff';
  const file = state.files[state.selectedFile];
  return (
    <Box flexGrow={1} flexDirection="column" borderStyle="round" borderColor={active ? 'cyan' : 'gray'}>
      <Text bold underline>
        {file ? file.path : 'Diff'}
      </Text>
      {state.view.length === 0 ? (
        <Text dimColor>{file?.binary ? 'binary file' : 'no diff to display'}</Text>
      ) : (
        <Box flexDirection="column">
          {state.view.map((line, i) => {
            const cursor = i === state.cursor;
            const gutter = line.oldLine !== undefined || line.newLine !== undefined ? '   ' : '  ';
            const num =
              line.kind === 'removed'
                ? String(line.oldLine ?? '').padStart(2)
                : String(line.newLine ?? '').padStart(2);
            return (
              <Text key={i} color={cursor ? 'black' : undefined} backgroundColor={cursor ? 'white' : undefined}>
                {cursor ? '▸' : ' '}
                {num}
                {gutter}
                <Text color={cursor ? undefined : DIFF_KIND_COLOR[line.kind]}>
                  {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                  {line.text}
                </Text>
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function ThreadsPane({ state }: { state: TuiState }): React.ReactElement {
  const active = state.pane === 'threads';
  const file = state.files[state.selectedFile];
  const threads = file
    ? state.threads.filter((t) => t.file === file.path && t.parentId === null)
    : [];
  return (
    <Box flexDirection="column" width={40} borderStyle="round" borderColor={active ? 'cyan' : 'gray'}>
      <Text bold underline>
        Threads
      </Text>
      {threads.length === 0 ? (
        <Text dimColor>no comments</Text>
      ) : (
        threads.map((thread) => (
          <Box key={thread.id} flexDirection="column">
            <Text color={thread.status === 'resolved' ? 'green' : 'yellow'}>
              {thread.status === 'resolved' ? '[ok]' : '[open]'} {thread.file}:{thread.line}
            </Text>
            <Text dimColor>{thread.body}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}

function KeyHints({ mode }: { mode: TuiState['mode'] }): React.ReactElement {
  if (mode === 'comment') {
    return <Text dimColor>enter=submit, esc=cancel</Text>;
  }
  if (mode === 'merge-confirm') {
    return <Text dimColor>y=merge, n=cancel</Text>;
  }
  return (
    <Text dimColor>
      j/k move · h/l file · tab pane · c comment · a approve · r request-changes · m merge · e export · q quit
    </Text>
  );
}

export function App({ review, diff, actions, onQuit }: AppProps): React.ReactElement {
  const [state, setState] = useState<TuiState>(() => initialTuiState(diff, review.comments));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState((prev) => reduce(prev, { type: 'refresh', files: diff, threads: review.comments }));
  }, [diff, review.comments]);

  const dispatch = (action: Parameters<typeof reduce>[1]): void => setState((prev) => reduce(prev, action));

  useInput(
    (input, key) => {
      if (busy) return;

      if (state.mode === 'comment') {
        if (key.escape) {
          dispatch({ type: 'comment-cancel' });
          return;
        }
        if (key.return) {
          submitComment();
          return;
        }
        if (key.backspace) {
          dispatch({ type: 'comment-change', value: state.commentBody.slice(0, -1) });
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          dispatch({ type: 'comment-change', value: state.commentBody + input });
        }
        return;
      }

      if (key.escape) {
        if (state.mode === 'merge-confirm') dispatch({ type: 'merge-cancel' });
        return;
      }

      if (state.mode === 'merge-confirm') {
        if (input === 'y') {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const merged = await actions.merge(false);
              setNotice(`merged: ${merged.headBranch} → ${merged.baseBranch}`);
              setState((prev) => reduce(prev, { type: 'refresh', files: diff, threads: merged.comments }));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          })();
        } else if (input === 'n') {
          dispatch({ type: 'merge-cancel' });
        }
        return;
      }

      if (state.mode !== 'browse') return;

      switch (input) {
        case 'j':
          dispatch({ type: 'cursor-down' });
          break;
        case 'k':
          dispatch({ type: 'cursor-up' });
          break;
        case 'h':
          dispatch({ type: 'file-prev' });
          break;
        case 'l':
          dispatch({ type: 'file-next' });
          break;
        case 'q':
          onQuit();
          return;
        case 'c': {
          const anchor = selectedAnchor(state);
          if (anchor) dispatch({ type: 'comment-start' });
          else setNotice('pick an added/context line to comment');
          break;
        }
        case 'a':
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const approved = await actions.approve();
              setNotice(`status → ${approved.status}`);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          })();
          break;
        case 'r':
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const updated = await actions.requestChanges();
              setNotice(`status → ${updated.status}`);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          })();
          break;
        case 'm':
          dispatch({ type: 'merge-start' });
          break;
        case 'e':
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const written = await actions.exportToFile();
              setNotice(`exported: ${written}`);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          })();
          break;
      }

      if (key.tab) {
        const cycle: Pane[] = ['files', 'diff', 'threads'];
        const next = cycle[(cycle.indexOf(state.pane) + 1) % cycle.length] as Pane;
        dispatch({ type: 'pane', pane: next });
      }
    },
  );

  const submitComment = (): void => {
    const anchor = selectedAnchor(state);
    if (!anchor) {
      dispatch({ type: 'comment-cancel' });
      return;
    }
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const updated = await actions.postComment(anchor.file, anchor.line, state.commentBody);
        dispatch({ type: 'comment-submit' });
        setNotice(`comment on ${anchor.file}:${anchor.line}`);
        setState((prev) => reduce(prev, { type: 'refresh', files: diff, threads: updated.comments }));
      } catch (err) {
        setError((err as Error).message);
        dispatch({ type: 'comment-submit' });
      } finally {
        setBusy(false);
      }
    })();
  };
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>
          {review.headBranch} <Text dimColor>→</Text> {review.baseBranch}
        </Text>
        <Text>
          {' '}
          · <Text color={review.status === 'approved' ? 'green' : review.status === 'request-changes' ? 'red' : 'yellow'}>{review.status}</Text>
        </Text>
        <Text dimColor> · {review.author}</Text>
      </Box>
      <Box>
        <FilesPane state={state} />
        <DiffPane state={state} />
        <ThreadsPane state={state} />
      </Box>
      {state.mode === 'comment' ? (
        <Box>
          <Text color="yellow">
            comment @ {state.files[state.selectedFile]?.path}:
            <Text bold>{state.commentBody}</Text>
          </Text>
        </Box>
      ) : state.mode === 'merge-confirm' ? (
        <Box>
          <Text color="yellow">Merge {review.headBranch} into {review.baseBranch}? [y/n]</Text>
        </Box>
      ) : (
        <Box>
          {error ? (
            <Text color="red">error: {error}</Text>
          ) : notice ? (
            <Text color="green">ok: {notice}</Text>
          ) : null}
        </Box>
      )}
      <KeyHints mode={state.mode} />
    </Box>
  );
}
