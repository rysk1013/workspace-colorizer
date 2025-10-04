# Workspace Colorizer

**Workspace Colorizer** は、開いているファイルが属する **ワークスペースフォルダごとに VS Code のタイトルバー／ステータスバーの色を自動で切り替える拡張機能** です。

マルチルートワークスペースで複数プロジェクトを同時に扱う場合に、
どのフォルダを操作しているのかを **色で即座に判別** できます。

## 主な機能

- アクティブなファイルの **所属フォルダごとに色を変更**
- 設定で **フォルダ名や正規表現** を使って色を指定可能
- ステータスバーの色も同時に変更（オプション）
- フォルダが設定されていない場合は **自動的に VS Code 本来の色に戻る**
- コマンドパレットから **「Workspace Colorizer: Reset Colors」** を実行すると
  - 元の VS Code 設定に復帰
  - `workspaceColorizer.folderColors` を User / Workspace 設定から削除（リセット）

## インストール方法

### ① ソースから（開発・ローカル使用）

```bash
git clone https://github.com/yourname/workspace-colorizer.git
cd workspace-colorizer
npm install
npm run build
```

### ② VSIX ファイルから

```bash
vsce package
```

生成された .vsix を「拡張機能パネル」 → 「（サイドバー右上の）…」 → 「Install from VSIX...」 でインストール。

## 初期設定

### 1. .code-workspace ファイルを作成し、マルチルートワークスペースを設定します

```json
{
  "folders": [
    {
      "path": "sample1"
    },
    {
      "path": "sample2"
    },
    {
      "path": "sample3"
    },
    {
      "path": "api-server"
    }
  ]
}
```

### 2. settings.json に下記の設定を参考に追加します

```json
{
  "window.titleBarStyle": "custom",
  "workspaceColorizer.folderColors": {
    "sample1": "#1E90FF",
    "sample2": "#32CD32",
    "sample3": "#FFD700",
    "^api-.*": "#FF6B6B"
  }
}
```

- "sample1" のようにフォルダ名をキーに指定
- ^api-.* のように正規表現キーも使用可能
- 値は #RRGGBB 形式のカラーコード

### 3. .code-workspace からワークスペースを開きます

ファイルを切り替えると、該当フォルダの色に即座に変化します。

未設定フォルダを開いた場合は自動的に元の VS Code テーマ色に戻ります。

## リセット

コマンドパレットを開き、`Workspace Colorizer: Reset Colors` を実行します。

`workspaceColorizer.folderColors` を settings.json から削除し、VS Code の元の色に戻します。

## ライセンス

MIT License
© 2025 Ryosuke
