import path from 'node:path';
import * as vscode from 'vscode';
import { GitCli, JsonFileReviewStore, ReviewService } from '@lopr/core';
import type { FileDiff } from '@lopr/core';
import { flattenHunks, parseDiffBody } from '@lopr/core';
import { ReviewController } from './controller.js';
import { webviewHtml } from './webview.js';

export const EXTENSION_ID = 'lopr';

const changedLinesDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(27, 94, 32, 0.15)',
  isWholeLine: true,
});

export function activate(context: vscode.ExtensionContext): void {
  const gateway = new GitCli();
  const serviceCache = new Map<string, ReviewService>();

  const serviceOf = async (cwd: string): Promise<ReviewService> => {
    const cached = serviceCache.get(cwd);
    if (cached) return cached;
    const repoRoot = await gateway.repoRoot(cwd);
    const store = new JsonFileReviewStore(path.join(repoRoot, '.lopr', 'reviews'));
    const service = new ReviewService({ gateway, store, cwd });
    serviceCache.set(cwd, service);
    return service;
  };

  const controllerOf = async (cwd: string): Promise<ReviewController> => {
    const repoRoot = await gateway.repoRoot(cwd);
    const service = await serviceOf(cwd);
    return new ReviewController({ service, repoRoot });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('lopr.openReview', async () => {
      const cwd = workspaceRoot();
      if (!cwd) {
        vscode.window.showWarningMessage('lopr: open a workspace folder first');
        return;
      }
      const controller = await controllerOf(cwd);

      const panel = vscode.window.createWebviewPanel(
        'lopr.review',
        'lopr review',
        vscode.ViewColumn.Beside,
        { enableScripts: true, localResourceRoots: [] },
      );
      panel.webview.html = webviewHtml();
      panel.webview.onDidReceiveMessage(
        (message) => {
          void (async () => {
            const reply = await controller.handle(message);
            await panel.webview.postMessage(reply);
          })();
        },
        undefined,
        context.subscriptions,
      );
      panel.onDidDispose(() => undefined, undefined, context.subscriptions);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lopr.status', async () => {
      const cwd = workspaceRoot();
      if (!cwd) {
        vscode.window.showWarningMessage('lopr: open a workspace folder first');
        return;
      }
      const controller = await controllerOf(cwd);
      const reply = await controller.handle({ type: 'init', reviewId: '(current branch)' });
      if (reply.type === 'init') {
        const { review, diff } = reply.payload;
        const open = review.comments.filter((c) => c.status === 'active').length;
        const lines = `${diff.reduce((n, f) => n + f.additions + f.deletions, 0)} changed lines`;
        vscode.window.showInformationMessage(
          `lopr: ${review.headBranch} -> ${review.baseBranch} · ${review.status} · ${open}/${review.comments.length} open threads · ${lines}`,
        );
      } else if (reply.type === 'error') {
        vscode.window.showErrorMessage(`lopr: ${reply.message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      void decorateChangedLines(editor, gateway, serviceOf);
    }),
  );

  void (async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) await decorateChangedLines(editor, gateway, serviceOf);
  })();

  context.subscriptions.push(changedLinesDecoration);
}

async function decorateChangedLines(
  editor: vscode.TextEditor,
  gateway: GitCli,
  serviceOf: (cwd: string) => Promise<ReviewService>,
): Promise<void> {
  const cwd = workspaceRoot();
  if (!cwd) return;
  try {
    const repoRoot = await gateway.repoRoot(cwd);
    const branch = await gateway.currentBranch(cwd);
    const service = await serviceOf(cwd);
    const reviews = await service.list();
    const open = reviews.find((r) => r.headBranch === branch && r.status !== 'merged' && r.status !== 'done' && r.status !== 'closed');
    if (!open) {
      editor.setDecorations(changedLinesDecoration, []);
      return;
    }
    const diff = await service.diffForReview(open.id);
    const ranges = changedLineRanges(diff.files, editor.document.uri.fsPath, repoRoot);
    editor.setDecorations(changedLinesDecoration, ranges);
  } catch {
    editor.setDecorations(changedLinesDecoration, []);
  }
}

export function changedLineRanges(files: FileDiff[], absolutePath: string, repoRoot: string): vscode.Range[] {
  const relative = path.relative(repoRoot, absolutePath).split(path.sep).join('/');
  const file = files.find((f) => f.path === relative);
  if (!file || file.binary) return [];
  const lines = flattenHunks(parseDiffBody(file.body).hunks);
  const ranges: vscode.Range[] = [];
  for (const line of lines) {
    if (line.kind === 'added' && line.newLine !== undefined) {
      const start = new vscode.Position(line.newLine - 1, 0);
      ranges.push(new vscode.Range(start, start.translate(0, 1)));
    }
  }
  return ranges;
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
