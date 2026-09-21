# ジロリアンマップ (Jirolian Map)

ラーメン二郎の直系全店舗のリアルタイム営業情報、店舗マップ、営業時間スケジュールの一元管理および制覇状況（訪問記録）トラッキングができるWebアプリケーションです。

🌐 **WebアプリURL**: [https://app.jirolianmap.com/](https://app.jirolianmap.com/)

---

## 📌 主な機能

### 1. 🗺️ リアルタイム営業状態 ＆ マップ・リスト表示
- **営業状況の自動判定**: 現在時刻に基づいて「営業中」「まもなく終了」「営業開始前」「営業時間外」「定休日」「臨時営業/休業」をリアルタイムで自動計算し、識別しやすいカラーコードで表示します。
- **現在地連携**: GPS（位置情報）を取得し、現在地やマップ中心からの距離順ソート・距離タグ表示が可能です。
- **マップ / リスト切り替え**: Leaflet.js を活用したインタラクティブな地図表示とカードリスト表示をスムーズに切替できます。

### 2. 🔀 多角的な表示レイアウト
- **最小レイアウト (`minimal`)**: 全店舗の営業・制覇状況をコンパクトなグリッドカードで一覧表示（スマホ表示に最適化）。
- **日別レイアウト (`today`)**: 指定日の全店舗の営業・休業判定をまとめて視覚化。
- **カレンダーレイアウト (`calendar`)**: 各店舗の月間・週間営業時間や臨時休業スケジュールを一覧化。
- **ポップアップ・詳細レイアウト**: 各店舗の詳しい営業時間表、住所、Googleマップ検索リンクを表示。

### 3. 🏆 直系店舗制覇（スタンプラリー）トラッキング
- **訪問記録機能**: 各店舗の「制覇済み」トグル管理。
- **制覇プログレスバー**: ヘッダーに `制覇: X / Y 店舗 (Z%)` の進捗状況をリアルタイム表示。
- **データバックアップ・復元**: インポート/エクスポート機能により、制覇データをJSONファイルとして保存・共有・復元が可能です。

### 4. 🔍 高度な検索・フィルタリング・並べ替え
- **キーワード検索**: 店舗名、フリガナ、住所から即座に検索。
- **絞り込みフィルター**: 営業状態別、制覇状態別（未訪問/訪問済み）、都道府県・地域別、曜日別。
- **並べ替え機能**:
  - 自治体コード順（都道府県順: JIS X 0401 昇順）
  - 現在地からの距離順 / マップ中心からの距離順
  - 開店日順（歴史順）/ 店舗名五十音順 / 営業開始時間順

### 5. 📸 画像キャプチャ生成 ＆ SNS共有
- **HTML2Canvas画像出力**: 現在表示中の店舗一覧やカレンダーを美しい画像（PNG）として自動生成。
- **共有カスタマイズ**:
  - 「制覇状況」「営業状況」の各表示トグル
  - 名義入れ用「ユーザー名」入力（画像ヘッダータイトル・SNS投稿コメントへ自動連動）
- **Web Share API ＆ X（旧Twitter）連動**: スマホの共有メニューやX投稿画面へシームレスに画像・テキストを渡せます。

### 6. 🤖 X (旧Twitter) 自動投稿Bot (`bot.js`)
- **自動画像投稿**: Playwright (Headless Chromium) ＋ Node.js ＋ GitHub Actions により、毎朝自動で全店舗の最新営業状況画像を生成し、公式Xアカウントへ自動ポストします。

### 8. 🤖 SNS営業・臨休情報の自動巡回 ＆ ワンタップ承認反映
- **自動巡回 ＆ 漏れ防止**: 定期GitHub Actionsワークフローにより、直系各店舗の公式X・Instagramの最新投稿（リプライツリー、ストーリーズ含む）を網羅的に自動巡回。3層の重複排除フィルターにより、過去処理済み投稿や既登録スケジュールの再解析を防止。
- **マルチモーダルAI解析 (Gemini 1.5 Flash)**: 「助手不在」「材料切れ」「祝日昼営業」といった個性的な投稿テキストに加え、**店頭の貼り紙写真、手書きホワイトボード、カレンダー画像（〇印や✕印）** からも正確に日付と営業・休業判定を自動抽出。
- **Webエディタでのワンタップ承認**: `editor.html` の「🔔 承認待ち」タブに元投稿とAI提案が一覧表示され、管理者は「✅ 承認して反映」ボタンをワンクリックするだけで `shops.json` に安全にマージ・コミットできます。

---

## 🛠️ 技術スタック

| 分野 | テクノロジー / ライブラリ |
| :--- | :--- |
| **フロントエンド** | HTML5, CSS3 (CSS Variables, Flexbox, CSS Grid), Vanilla JavaScript (ES6+) |
| **地図描画** | [Leaflet.js](https://leafletjs.net/) |
| **画像生成** | [html2canvas](https://html2canvas.hertzen.com/) |
| **AI解析エンジン** | Google Gemini 1.5 Flash (Multimodal Text & Vision API) |
| **自動化Bot / 巡回** | Node.js, [Playwright](https://playwright.dev/), `twitter-api-v2`, GitHub Actions |
| **データ構造** | `shops.json` (店舗マスターDB), `data/pending_updates.json` (承認待ちデータ) |
| **ホスティング** | GitHub Pages (カスタムドメイン: `app.jirolianmap.com`) |

---

## 📂 ディレクトリ・ファイル構成

```text
├── index.html                  # メインアプリケーション画面
├── editor.html                 # 店舗データ編集・メンテナンス用Webエディタ画面
├── shops.json                  # 直系全店舗のマスターデータ（住所、緯度経度、通常営業時間、臨時営業・休業情報）
├── bot.js                      # X (旧Twitter) 自動投稿用 Playwright スクリプト
│
├── data/
│   ├── pending_updates.json    # SNS自動検出による承認待ち営業変更リスト
│   └── crawled_cache.json      # 重複解析防止用SNSクローラーキャッシュ
│
├── scripts/
│   ├── sns_crawler.js          # 全店舗SNS巡回・投稿収集スクリプト
│   └── analyze_posts.js        # Gemini 1.5 Flash によるテキスト・画像営業情報解析エンジン
│
├── css/
│   ├── variables.css           # 共通デザイントークン（二郎カラー、ダークテーマ、営業状態ステータス色）
│   ├── style.css               # メインアプリ用スタイルシート
│   └── editor.css              # エディタ専用スタイルシート
│
└── js/
    ├── common/                 # アプリ＆エディタ共通モジュール
    │   ├── lg_codes.js         # JIS全国地方公共団体コードユーティリティ
    │   ├── utils.js            # 共通ユーティリティ（文字正規化、日付・時刻計算、距離計算）
    │   └── business-hours.js   # 営業時間・営業状況判定エンジン（祝日判定、シフトパース）
    ├── app/
    │   └── share.js            # 画像生成（html2canvas）・SNS共有・キャプチャモーダル制御
    ├── app.js                  # メインアプリケーション制御ロジック
    └── editor.js               # データエディタ制御ロジック
```

---

## 🔑 GitHub Secrets の設定

自動投稿およびSNS自動巡回を使用する場合、GitHubリポジトリの **Settings > Secrets and variables > Actions** に以下の環境変数を登録してください：

| シークレット名 | 概要 | 必須 |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google AI Studio の APIキー（無料枠あり。SNS投稿テキスト・画像の営業解析用） | 推奨 |
| `TWITTER_API_KEY` | 公式Xアカウント自動投稿用のAPI Key | 自動ポスト用 |
| `TWITTER_API_SECRET` | 公式Xアカウント自動投稿用のAPI Secret | 自動ポスト用 |
| `TWITTER_ACCESS_TOKEN` | 公式Xアカウント自動投稿用のAccess Token | 自動ポスト用 |
| `TWITTER_ACCESS_SECRET` | 公式Xアカウント自動投稿用のAccess Secret | 自動ポスト用 |

---

## 📜 オープンデータ・クレジット表記 (Attribution)

本アプリケーションでは以下のオープンデータおよびオープンソースソフトウェアを使用しています。

- **地図背景データ**: [&copy; OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL)
- **全国都道府県・市区町村マスターデータ**: [Geolonia japanese-addresses](https://github.com/geolonia/japanese-addresses) (CC BY 4.0)
- **店舗歴史データ一部参照**: [Take4 二郎 食記録 ラーメン二郎 年表](https://take4.hiyamugi.com/shop/shop_history.htm)

---

## 🔒 プライバシー・コンプライアンス (電気通信事業法外部送信規律)

当サービスでは、品質向上および個別データ保存のため以下の外部送信およびローカルストレージを利用しています。

- **Google Analytics (Google LLC)**: アクセス解析およびトラフィック分析目的（Cookie / IPアドレス / 閲覧ログ）。オプトアウトは [Google アナリティクス オプトアウト アドオン](https://tools.google.com/dlpage/gaoptout?hl=ja) をご利用ください。
- **Browser LocalStorage**: 匿名生成端末ID (`jiro_user_id`) および訪問記録（店舗制覇データ）の保持。

---

## 📄 ライセンス

[MIT License](LICENSE)

