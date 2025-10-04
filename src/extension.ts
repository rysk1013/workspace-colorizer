import * as vscode from 'vscode';

type ColorMap = Record<string, string>;

const CFG_SECTION = 'workspaceColorizer';

// 起動時の元テーマ（Workspace スコープの colorCustomizations）
let originalWorkspaceColors: any | undefined;

// 直近に「どのキー（original or フォルダ名）」を適用したか
let lastAppliedKey: string | undefined;

// 連続イベントをまとめるためのタイマー
let applyTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  originalWorkspaceColors = getCurrentWorkspaceColorCustomizations();

  const scheduleApply = () => {
    if (applyTimer) clearTimeout(applyTimer);
    // ほんの少し待つことで連続イベントをまとめる（体感を滑らかに）
    applyTimer = setTimeout(applyColorForActiveEditorOnce, 80);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(scheduleApply),
    vscode.workspace.onDidSaveTextDocument(scheduleApply),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleApply),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration(`${CFG_SECTION}.folderColors`) ||
        e.affectsConfiguration(`${CFG_SECTION}.statusBarSync`)
      ) scheduleApply();
    }),
    vscode.commands.registerCommand('workspaceColorizer.reset', async () => {
      await setWorkspaceColorCustomizations(originalWorkspaceColors ?? null);
      lastAppliedKey = 'original';
      vscode.window.showInformationMessage('Workspace Colorizer: Restored original colors for this workspace.');
    })
  );

  const titleBarStyle = vscode.workspace.getConfiguration('window').get<string>('titleBarStyle');
  if (titleBarStyle !== 'custom') {
    vscode.window.showWarningMessage(
      'Workspace Colorizer: window.titleBarStyle が "custom" でないため色が反映されない可能性があります。ユーザー設定に "window.titleBarStyle": "custom" を設定してください。'
    );
  }

  scheduleApply();
}

export function deactivate() {
  // 必要ならここで originalWorkspaceColors に戻す処理を入れても良い
}

/** 必要なときに 1 回だけ更新する（“元に戻す→上書き”の二度手間をしない） */
async function applyColorForActiveEditorOnce() {
  const editor = vscode.window.activeTextEditor;

  // どの色を適用すべきかを先に決める
  const desired = decideDesiredKeyAndColor(editor);

  // 直前と同じなら更新不要
  if (desired.key === lastAppliedKey) return;

  // 反映：該当なしなら元色、該当ありなら元色に対して上書き
  if (!desired.hex) {
    await setWorkspaceColorCustomizations(originalWorkspaceColors ?? null);
  } else {
    const base = clone(originalWorkspaceColors) ?? {};
    const syncStatus = vscode.workspace.getConfiguration(CFG_SECTION).get<boolean>('statusBarSync', true);
    const next = {
      ...base,
      'titleBar.activeBackground': desired.hex,
      'titleBar.inactiveBackground': withAlpha(desired.hex, 0.6),
      'titleBar.activeForeground': '#ffffff',
      'titleBar.inactiveForeground': '#ffffffcc',
      ...(syncStatus
        ? {
            'statusBar.background': desired.hex,
            'statusBar.foreground': '#ffffff'
          }
        : {})
    };
    await setWorkspaceColorCustomizations(next);
  }

  lastAppliedKey = desired.key;
}

/** どの色を適用すべきか：{ key: 'original' | フォルダ名等, hex?: '#RRGGBB' } を返す */
function decideDesiredKeyAndColor(editor: vscode.TextEditor | undefined): { key: string; hex?: string } {
  if (!editor) return { key: 'original' };

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) return { key: 'original' };

  const cfg = vscode.workspace.getConfiguration(CFG_SECTION);
  const map = (cfg.get<ColorMap>('folderColors') ?? {}) as ColorMap;

  // 厳密一致 → 正規表現キーの順でマッチ
  if (map[folder.name]) return { key: folder.name, hex: map[folder.name] };
  for (const [pattern, color] of Object.entries(map)) {
    if (looksLikeRegex(pattern)) {
      try {
        if (new RegExp(pattern).test(folder.name)) return { key: pattern, hex: color };
      } catch { /* 無効な正規表現は無視 */ }
    }
  }
  return { key: 'original' };
}

function looksLikeRegex(s: string) {
  return /[\^\$\.\*\+\?\(\)\[\]\{\}\|]/.test(s);
}

function withAlpha(hex: string, alpha: number) {
  const a = Math.round(alpha * 255);
  const aa = a.toString(16).padStart(2, '0');
  return hex.length === 7 ? `${hex}${aa}` : hex;
}

/** 現在（Workspace スコープ）の colorCustomizations を取得 */
function getCurrentWorkspaceColorCustomizations(): any | undefined {
  return vscode.workspace.getConfiguration('workbench').get<any>('colorCustomizations');
}

/** Workspace スコープに colorCustomizations を設定（null で削除） */
async function setWorkspaceColorCustomizations(value: any | null) {
  await vscode.workspace.getConfiguration('workbench')
    .update('colorCustomizations', value, vscode.ConfigurationTarget.Workspace);
}

function clone<T>(obj: T): T {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj as any;
}
