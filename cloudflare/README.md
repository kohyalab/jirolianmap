# Cloudflare Worker スケジューラー設定ガイド

本Workerは、**SNS公式投稿巡回（毎時0分、30分）** と **毎朝の定期X自動投稿（毎日 JST 07:00）** を統合管理し、GitHub Actionsを定期実行するためのスケジューラーです。

今後新しい定期実行タスクを追加したい場合も、`worker.js` 内の `SCHEDULED_JOBS` 配列にエントリを1つ追加するだけで簡単に拡張できます。

---

## 1. 登録されている定期実行ジョブ

| ジョブID | ジョブ名 | スケジュール (Cron) | 実行対象 |
| :--- | :--- | :--- | :--- |
| `sns-monitor` | SNS公式投稿巡回 & 営業変更自動検知 | `0,30 * * * *` (毎時0分, 30分) | GitHub Actions: `sns_monitor.yml` |
| `daily-post` | 二郎営業マップ 毎朝の定期自動ツイート | `0 22 * * *` (JST 07:00 / UTC 22:00) | GitHub Actions: `daily_post.yml` |

---

## 2. Cloudflareへのセットアップ手順

### 方法A: Cloudflare ダッシュボード上で直接設定する場合（最も簡単）

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログインし、**Workers & Pages** > **作成** > **Worker を作成** を選択します。
2. 名前（例: `jirolianmap-scheduler`）を入力してデプロイします。
3. **コードを編集** を開き、[`cloudflare/worker.js`](worker.js) の内容をそのまま貼り付けて **保存してデプロイ** します。
4. **設定 (Settings)** > **変数 (Variables and Secrets)** にて以下を登録します:
   - `GITHUB_PAT`（Secret推奨）: GitHubのPersonal Access Token（リポジトリへの `contents: write` 権限または `repo` 権限を持つトークン）
   - `GITHUB_OWNER`（Text）: `kohyalab`
   - `GITHUB_REPO`（Text）: `jirolianmap`
   - `ADMIN_SECRET`（Secret、任意）: 手動実行APIの保護用トークン
5. **設定 (Settings)** > **トリガー (Triggers)** > **Cron トリガー** に以下の2つのCron式を追加します:
   - `0,30 * * * *` （毎時0分、30分）
   - `0 22 * * *` （毎日 JST 07:00 / UTC 22:00）

---

### 方法B: Wrangler CLI でデプロイする場合

```bash
cd cloudflare

# GitHub PATをシークレットとして登録
npx wrangler secret put GITHUB_PAT

# デプロイ
npx wrangler deploy
```

---

## 3. 手動テスト・HTTP API

Worker URLにブラウザやcURLでアクセスして動作確認が可能です:

- **状態確認 / ヘルスチェック**:
  ```bash
  curl https://<your-worker-subdomain>.workers.dev/
  ```
- **SNS巡回を手動で即座に実行**:
  ```bash
  curl -X POST https://<your-worker-subdomain>.workers.dev/trigger/sns-monitor
  ```
- **朝の定期ポストを手動で即座に実行**:
  ```bash
  curl -X POST https://<your-worker-subdomain>.workers.dev/trigger/daily-post
  ```
