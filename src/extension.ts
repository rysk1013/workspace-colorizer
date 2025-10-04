import * as vscode from 'vscode';

type ColorMap = Record<string, string>;

const CFG_SECTION = 'workspaceColorizer';

// 起動時に保存する「このワークスペースの元の色」
let originalWorkspaceColors: any | undefined;

// 直前に適用したキー（'original' | フォルダ名 | 正規表現キー）
let lastAppliedKey: string | undefined;

// 連続イベントのデバウンス用
let applyTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  // 起動時の元色を保持（workspace スコープの colorCustomizations）
  originalWorkspaceColors = getCurrentWorkspaceColorCustomizations();

  const scheduleApply = () => {
    const debounceMs = vscode.workspace
      .getConfiguration(CFG_SECTION)
      .get<number>('debounceMs', 80);
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(applyOnce, Math.max(0, debounceMs));
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(scheduleApply),
    vscode.workspace.onDidSaveTextDocument(scheduleApply),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleApply),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration(`${CFG_SECTION}.folderColors`) ||
        e.affectsConfiguration(`${CFG_SECTION}.statusBarSync`) ||
        e.affectsConfiguration(`${CFG_SECTION}.debounceMs`)
      ) scheduleApply();
    }),

    // ✅ Reset：ワークスペースの色上書きを元に戻し、
    //    さらに User / Workspace の folderColors を既定にリセット（削除）する
    vscode.commands.registerCommand('workspaceColorizer.reset', async () => {
      // 1) タイトル/ステータスバーの上書きを復元（= ワークスペースでの上書きを消す or 以前の値へ戻す）
      await setWorkspaceColorCustomizations(originalWorkspaceColors ?? null);

      // 2) folderColors を Workspace スコープから削除（あれば）
      await vscode.workspace
        .getConfiguration(CFG_SECTION)
        .update('folderColors', undefined, vscode.ConfigurationTarget.Workspace);

      // 3) folderColors を User スコープからも削除（リクエスト要件）
      await vscode.workspace
        .getConfiguration(CFG_SECTION)
        .update('folderColors', undefined, vscode.ConfigurationTarget.Global);

      lastAppliedKey = 'original';
      vscode.window.showInformationMessage(
        'Workspace Colorizer: Restored original colors and reset "folderColors" in User/Workspace settings.'
      );
    })
  );

  // ユーザー設定で custom タイトルバーを促す（拡張からは変えられない）
  const titleBarStyle = vscode.workspace.getConfiguration('window').get<string>('titleBarStyle');
  if (titleBarStyle !== 'custom') {
    vscode.window.showWarningMessage(
      'Workspace Colorizer: window.titleBarStyle が "custom" でないため色が反映されない可能性があります。ユーザー設定に "window.titleBarStyle": "custom" を設定してください。'
    );
  }

  scheduleApply();
}

export function deactivate() {
  // 必要ならここで original に戻す処理を呼んでも良い
}

/** 今回必要な更新だけを 1 回だけ行い、チラつきを防ぐ */
async function applyOnce() {
  const desired = decideDesiredKeyAndColor(vscode.window.activeTextEditor);

  // 直前と同じなら更新しない（無駄な再描画を防止）
  if (desired.key === lastAppliedKey) return;

  if (!desired.hex) {
    // 該当なし → 元の設定に戻す（上書き削除 or 既存値へ復元）
    await setWorkspaceColorCustomizations(originalWorkspaceColors ?? null);
    lastAppliedKey = 'original';
    return;
  }

  // 該当あり → 元設定をベースに必要箇所のみ上書き
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
  lastAppliedKey = desired.key;
}

/** どの色を適用すべきかを判定 */
function decideDesiredKeyAndColor(editor: vscode.TextEditor | undefined): { key: string; hex?: string } {
  if (!editor) return { key: 'original' };

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) return { key: 'original' };

  const map = (vscode.workspace.getConfiguration(CFG_SECTION).get<ColorMap>('folderColors') ?? {}) as ColorMap;

  // 厳密一致を最優先
  if (map[folder.name]) return { key: folder.name, hex: map[folder.name] };

  // 正規表現キーに対応（例: "^api-.*": "#FF6B6B"）
  for (const [pattern, color] of Object.entries(map)) {
    if (looksLikeRegex(pattern)) {
      try {
        if (new RegExp(pattern).test(folder.name)) return { key: pattern, hex: color };
      } catch {
        // 無効な正規表現は無視
      }
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
  return hex.length === 7 ? `${hex}${aa}` : hex; // #RRGGBB → #RRGGBBAA
}

/** 現在（Workspace スコープ）の colorCustomizations を取得 */
function getCurrentWorkspaceColorCustomizations(): any | undefined {
  return vscode.workspace.getConfiguration('workbench').get<any>('colorCustomizations');
}

/** Workspace スコープに colorCustomizations を設定（null で削除） */
async function setWorkspaceColorCustomizations(value: any | null) {
  await vscode.workspace
    .getConfiguration('workbench')
    .update('colorCustomizations', value, vscode.ConfigurationTarget.Workspace);
}

function clone<T>(obj: T): T {
  return obj ? JSON.parse(JSON.stringify(obj)) : (obj as any);
}
