export function webviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:; script-src 'unsafe-inline';" />
<title>lopr</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--vscode-font-family); font-size: 13px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
  header .spacer { flex: 1; }
  .badge { padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .badge.approved { background: #2d7a4d33; color: #4ec97c; }
  .badge.request-changes { background: #a1260d33; color: #f48771; }
  .badge.open { background: #b8950033; color: #e2c65c; }
  .badge.merged, .badge.done, .badge.closed { background: #5558; color: #ccc; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: 0.5; cursor: default; }
  main { display: flex; height: calc(100vh - 46px); }
  aside { width: 260px; border-right: 1px solid var(--vscode-panel-border); overflow: auto; transition: width 0.15s, min-width 0.15s; min-width: 260px; }
  aside.collapsed { width: 0; min-width: 0; border-right: none; overflow: hidden; }
  .file { padding: 6px 10px; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; }
  .file.active { background: var(--vscode-list-activeSelectionBackground); }
  .file:hover:not(.active) { background: var(--vscode-list-hoverBackground); }
  .file .meta { color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
  section.diff { flex: 1; overflow: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size, 12px); }
  .empty { padding: 20px; color: var(--vscode-descriptionForeground); }
  .diff-line { display: flex; white-space: pre; cursor: pointer; }
  .diff-line:hover { background: var(--vscode-list-hoverBackground); }
  .diff-line.selected { background: var(--vscode-editor-selectionBackground); }
  .diff-line.added { background: #1b5e2033; }
  .diff-line.removed { background: #5e1b2033; }
  .num { width: 3.2em; text-align: right; padding-right: 6px; color: var(--vscode-editorLineNumber-foreground); user-select: none; flex-shrink: 0; }
  .sign { width: 1.2em; flex-shrink: 0; }
  .text { flex: 1; }
  .diff-line.anchorable .num { cursor: pointer; }
  .threads { width: 320px; border-left: 1px solid var(--vscode-panel-border); overflow: auto; padding: 8px; }
  .thread { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 8px; }
  .thread-head { padding: 4px 8px; font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 6px; align-items: center; }
  .thread-head .resolved { color: #4ec97c; }
  .thread-body { padding: 4px 8px; white-space: pre-wrap; }
  .reply { padding: 4px 8px; border-top: 1px solid var(--vscode-panel-border); }
  textarea { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; padding: 4px; resize: vertical; }
  .row { display: flex; gap: 6px; margin-top: 4px; }
  .notice { position: fixed; bottom: 8px; right: 12px; padding: 6px 12px; background: var(--vscode-notifications-background); border-radius: 3px; }
  .notice.error { color: #f48771; }
  .folder { padding: 4px 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-weight: 600; user-select: none; }
  .folder:hover { background: var(--vscode-list-hoverBackground); }
  .folder .arrow { transition: transform 0.1s; display: inline-block; width: 1em; text-align: center; }
  .folder .arrow.collapsed { transform: rotate(-90deg); }
  .folder-children { display: block; }
  .folder-children.hidden { display: none; }
  .view-toggle { display: flex; gap: 2px; background: var(--vscode-button-secondaryBackground); border-radius: 3px; padding: 2px; }
  .view-toggle button { padding: 2px 8px; border-radius: 2px; font-size: 11px; }
  .view-toggle button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .side-by-side { display: flex; flex: 1; overflow: hidden; }
  .side-by-side .pane { flex: 1; overflow: auto; border-right: 1px solid var(--vscode-panel-border); }
  .side-by-side .pane:last-child { border-right: none; }
  .side-by-side .pane-header { padding: 4px 10px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
  .side-by-side .diff-line { display: flex; }
  .side-by-side .diff-line .num { width: 3.2em; }
  .suggestion { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size, 11px); background: var(--vscode-editor-background); padding: 4px; margin: 4px 0; }
  code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
</style>
</head>
<body>
<header>
  <strong>lopr</strong>
  <span id="branches"></span>
  <span id="status" class="badge open"></span>
  <span id="author" style="opacity:0.7"></span>
  <span id="conflicts"></span>
  <span class="spacer"></span>
  <button id="btn-toggle-files" class="secondary" title="Toggle file list">Files</button>
  <div class="view-toggle" id="view-toggle">
    <button id="btn-unified" class="active" title="Unified diff view">Unified</button>
    <button id="btn-side-by-side" title="Side by side diff view">Split</button>
  </div>
  <button id="btn-approve" title="Approve the review">Approve</button>
  <button id="btn-request" class="secondary" title="Request changes">Request changes</button>
  <button id="btn-merge" title="Merge into base">Merge</button>
  <button id="btn-export" class="secondary" title="Write REVIEW.md">Export</button>
</header>
<main>
  <aside id="files"></aside>
  <section class="diff"><div id="diff" class="empty">loading…</div></section>
  <aside class="threads">
    <h3 style="margin:0 0 8px">Threads</h3>
    <div id="threads"></div>
  </aside>
</main>
<div id="notice" class="notice" hidden></div>
<script>
(function () {
  const vscode = acquireVsCodeApi();
  const state = { review: null, diff: [], selectedFile: null, selectedLine: null, commentBody: '', viewMode: 'unified', collapsedFolders: new Set(), filesCollapsed: false };
  const $ = (id) => document.getElementById(id);

  function post(message) { vscode.postMessage(message); }

  function render() {
    renderHeader();
    renderFiles();
    renderDiff();
    renderThreads();
  }

  function renderHeader() {
    const r = state.review;
    if (!r) return;
    $('branches').textContent = r.headBranch + ' -> ' + r.baseBranch;
    const badge = $('status');
    badge.textContent = r.status;
    badge.className = 'badge ' + r.status;
    $('author').textContent = 'by ' + r.author;
    $('conflicts').textContent = r.conflicts.length ? '(' + r.conflicts.length + ' auto-resolved conflict' + (r.conflicts.length > 1 ? 's' : '') + ')' : '';
    $('btn-merge').disabled = r.status !== 'approved';
  }

  function renderFiles() {
    const list = $('files');
    list.textContent = '';
    if (!state.diff.length) {
      list.textContent = 'no changes';
      return;
    }
    const tree = buildFileTree(state.diff);
    renderTreeNode(list, tree, '', 0);
  }

  function buildFileTree(files) {
    const root = {};
    for (const file of files) {
      const parts = file.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]]) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = file;
    }
    return root;
  }

  function renderTreeNode(container, node, prefix, depth) {
    const keys = Object.keys(node).sort((a, b) => {
      const aIsDir = typeof node[a] !== 'object' || !node[a].path;
      const bIsDir = typeof node[b] !== 'object' || !node[b].path;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      const value = node[key];
      if (value.path) {
        const file = value;
        const el = document.createElement('div');
        el.className = 'file' + (file.path === state.selectedFile ? ' active' : '');
        el.style.paddingLeft = (10 + depth * 16) + 'px';
        el.innerHTML = '<span>' + esc(key) + '</span><span class="meta">+' + file.additions + ' -' + file.deletions + '</span>';
        el.onclick = () => { state.selectedFile = file.path; state.selectedLine = null; render(); };
        container.appendChild(el);
      } else {
        const folderPath = prefix ? prefix + '/' + key : key;
        const isCollapsed = state.collapsedFolders.has(folderPath);
        const folder = document.createElement('div');
        folder.className = 'folder';
        folder.style.paddingLeft = (10 + depth * 16) + 'px';
        const arrow = document.createElement('span');
        arrow.className = 'arrow' + (isCollapsed ? ' collapsed' : '');
        arrow.textContent = '\u25BC';
        folder.appendChild(arrow);
        folder.appendChild(document.createTextNode(key));
        folder.onclick = () => {
          if (state.collapsedFolders.has(folderPath)) state.collapsedFolders.delete(folderPath);
          else state.collapsedFolders.add(folderPath);
          render();
        };
        container.appendChild(folder);
        if (!isCollapsed) {
          const children = document.createElement('div');
          children.className = 'folder-children';
          renderTreeNode(children, value, folderPath, depth + 1);
          container.appendChild(children);
        }
      }
    }
  }

  function renderDiff() {
    if (state.viewMode === 'side-by-side') { renderDiffSideBySide(); return; }
    const root = $('diff');
    const file = state.diff.find((f) => f.path === state.selectedFile);
    if (!file) { root.className = 'empty'; root.textContent = state.diff.length ? 'select a file' : 'no changes to review'; return; }
    root.className = '';
    root.textContent = '';
    if (file.binary) { root.className = 'empty'; root.textContent = 'binary file'; return; }
    for (const line of file.lines) {
      const el = document.createElement('div');
      el.className = 'diff-line ' + line.kind + (state.selectedLine === line.newLine ? ' selected' : '');
      const numOld = document.createElement('span');
      numOld.className = 'num';
      numOld.textContent = line.kind === 'removed' ? String(line.oldLine ?? '') : '';
      const numNew = document.createElement('span');
      numNew.className = 'num';
      numNew.textContent = line.newLine !== undefined ? String(line.newLine) : '';
      const sign = document.createElement('span');
      sign.className = 'sign';
      sign.textContent = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = line.text || ' ';
      el.appendChild(numOld);
      el.appendChild(numNew);
      el.appendChild(sign);
      el.appendChild(text);
      if (line.newLine !== undefined) {
        el.onclick = () => { state.selectedLine = line.newLine; render(); };
      }
      root.appendChild(el);
    }
  }

  function renderDiffSideBySide() {
    const root = $('diff');
    const file = state.diff.find((f) => f.path === state.selectedFile);
    if (!file) { root.className = 'empty'; root.textContent = state.diff.length ? 'select a file' : 'no changes to review'; return; }
    root.className = 'side-by-side';
    root.textContent = '';
    if (file.binary) { root.className = 'empty'; root.textContent = 'binary file'; return; }
    const leftPane = document.createElement('div');
    leftPane.className = 'pane';
    const leftHeader = document.createElement('div');
    leftHeader.className = 'pane-header';
    leftHeader.textContent = 'old';
    leftPane.appendChild(leftHeader);
    const rightPane = document.createElement('div');
    rightPane.className = 'pane';
    const rightHeader = document.createElement('div');
    rightHeader.className = 'pane-header';
    rightHeader.textContent = 'new';
    rightPane.appendChild(rightHeader);
    for (const line of file.lines) {
      if (line.kind === 'context') {
        leftPane.appendChild(sideBySideLine(line, 'old'));
        rightPane.appendChild(sideBySideLine(line, 'new'));
      } else if (line.kind === 'removed') {
        leftPane.appendChild(sideBySideLine(line, 'old'));
        const empty = document.createElement('div');
        empty.className = 'diff-line';
        empty.style.height = '1.5em';
        leftPane.appendChild(empty);
      } else {
        const empty = document.createElement('div');
        empty.className = 'diff-line';
        empty.style.height = '1.5em';
        rightPane.appendChild(empty);
        rightPane.appendChild(sideBySideLine(line, 'new'));
      }
    }
    root.appendChild(leftPane);
    root.appendChild(rightPane);
  }

  function sideBySideLine(line, side) {
    const el = document.createElement('div');
    el.className = 'diff-line ' + line.kind;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = side === 'old' ? String(line.oldLine ?? '') : line.newLine !== undefined ? String(line.newLine) : '';
    const sign = document.createElement('span');
    sign.className = 'sign';
    sign.textContent = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = line.text || ' ';
    el.appendChild(num);
    el.appendChild(sign);
    el.appendChild(text);
    if (line.newLine !== undefined) {
      el.onclick = () => { state.selectedLine = line.newLine; render(); };
    }
    return el;
  }

  function renderThreads() {
    const root = $('threads');
    root.textContent = '';
    if (!state.review) return;
    const roots = state.review.comments.filter((c) => !c.parentId && c.file === state.selectedFile);
    if (!roots.length) { root.textContent = 'no threads on this file'; }
    for (const rootComment of roots) {
      root.appendChild(threadEl(rootComment));
    }
    const composer = document.createElement('div');
    composer.className = 'thread';
    composer.innerHTML = '<div class="thread-head">new comment' + (state.selectedLine ? ' · line ' + state.selectedLine : ' · select a diff line') + '</div>';
    const area = document.createElement('textarea');
    area.placeholder = 'leave a comment on the selected line…';
    area.value = state.commentBody;
    area.oninput = () => { state.commentBody = area.value; };
    composer.appendChild(area);
    const row = document.createElement('div');
    row.className = 'row';
    const btn = document.createElement('button');
    btn.textContent = 'Comment';
    btn.disabled = !state.selectedLine || !area.value.trim();
    btn.onclick = () => {
      post({ type: 'comment', reviewId: state.review.id, file: state.selectedFile, line: state.selectedLine, body: area.value.trim() });
      area.value = '';
      state.commentBody = '';
    };
    row.appendChild(btn);
    composer.appendChild(row);
    root.appendChild(composer);
  }

  function threadEl(comment) {
    const box = document.createElement('div');
    box.className = 'thread';
    const head = document.createElement('div');
    head.className = 'thread-head';
    const status = document.createElement('span');
    status.className = comment.status === 'resolved' ? 'resolved' : '';
    status.textContent = comment.status === 'resolved' ? '[resolved]' : '[open]';
    head.appendChild(status);
    head.appendChild(document.createTextNode(comment.file + ':' + comment.line + ' · ' + comment.author + ' · ' + comment.createdAt));
    box.appendChild(head);
    const body = document.createElement('div');
    body.className = 'thread-body';
    body.textContent = comment.body;
    box.appendChild(body);
    if (comment.suggestion) {
      const sug = document.createElement('div');
      sug.className = 'suggestion';
      sug.textContent = comment.suggestion.oldText + ' -> ' + comment.suggestion.newText;
      box.appendChild(sug);
      const apply = document.createElement('button');
      apply.textContent = 'Apply suggestion';
      apply.onclick = () => post({ type: 'applySuggestion', reviewId: state.review.id, commentId: comment.id });
      box.appendChild(apply);
    }
    for (const reply of state.review.comments.filter((c) => c.parentId === comment.id)) {
      const r = document.createElement('div');
      r.className = 'reply';
      r.textContent = reply.author + ': ' + reply.body;
      box.appendChild(r);
    }
    const actions = document.createElement('div');
    actions.className = 'row';
    if (comment.status !== 'resolved') {
      const resolve = document.createElement('button');
      resolve.className = 'secondary';
      resolve.textContent = 'Resolve';
      resolve.onclick = () => post({ type: 'resolve', reviewId: state.review.id, commentId: comment.id });
      actions.appendChild(resolve);
    }
    const replyBtn = document.createElement('button');
    replyBtn.className = 'secondary';
    replyBtn.textContent = 'Reply';
    actions.appendChild(replyBtn);
    replyBtn.onclick = () => {
      const input = document.createElement('textarea');
      input.placeholder = 'reply…';
      const send = document.createElement('button');
      send.textContent = 'Send';
      send.onclick = () => {
        post({ type: 'comment', reviewId: state.review.id, file: comment.file, line: comment.line, body: input.value.trim(), replyTo: comment.id });
        input.remove();
        send.remove();
      };
      actions.appendChild(input);
      actions.appendChild(send);
    };
    return box;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let noticeTimer = null;
  function notice(message, isError) {
    const el = $('notice');
    el.textContent = (isError ? 'error: ' : '') + message;
    el.className = 'notice' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  let mergeArmed = false;
  $('btn-approve').onclick = () => post({ type: 'transition', reviewId: state.review.id, status: 'approved' });
  $('btn-request').onclick = () => post({ type: 'transition', reviewId: state.review.id, status: 'request-changes' });
  $('btn-merge').onclick = () => {
    if (!mergeArmed) {
      mergeArmed = true;
      $('btn-merge').textContent = 'Confirm merge?';
      notice('click again to merge ' + state.review.headBranch + ' into ' + state.review.baseBranch);
      setTimeout(() => { mergeArmed = false; $('btn-merge').textContent = 'Merge'; }, 3000);
      return;
    }
    mergeArmed = false;
    $('btn-merge').textContent = 'Merge';
    post({ type: 'merge', reviewId: state.review.id, cleanup: false });
  };
  $('btn-export').onclick = () => post({ type: 'export', reviewId: state.review.id });
  $('btn-unified').onclick = () => { state.viewMode = 'unified'; $('btn-unified').classList.add('active'); $('btn-side-by-side').classList.remove('active'); render(); };
  $('btn-side-by-side').onclick = () => { state.viewMode = 'side-by-side'; $('btn-side-by-side').classList.add('active'); $('btn-unified').classList.remove('active'); render(); };
  $('btn-toggle-files').onclick = () => { state.filesCollapsed = !state.filesCollapsed; $('files').classList.toggle('collapsed', state.filesCollapsed); };

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'init') {
      state.review = message.payload.review;
      state.diff = message.payload.diff;
      state.selectedFile = state.diff.length ? state.diff[0].path : null;
      state.selectedLine = null;
      render();
    } else if (message.type === 'update') {
      state.review = message.payload.review;
      render();
    } else if (message.type === 'exported') {
      notice('exported ' + message.path);
    } else if (message.type === 'error') {
      notice(message.message, true);
    }
  });

  post({ type: 'init', reviewId: '(current branch)' });
})();
</script>
</body>
</html>
`;
}
