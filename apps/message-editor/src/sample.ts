import type { ReplyReviewPayload } from "@cre/message-payload";

/**
 * URL にデータがないときに表示する見本。ドキュメントのモック画像もこのデータで撮る。
 * 問い合わせ・根拠・確認結果はすべて架空。
 */
export const samplePayload: ReplyReviewPayload = {
  version: 1,
  generatedAt: "2026-10-06T10:00:00+09:00",
  model: { name: "decision-model（仮）", version: "0.1" },
  inquiry: {
    from: "田中 様",
    subject: "CSV インポートの仕様と、初期設定について",
    receivedAt: "2026-10-06T09:15:00+09:00",
    paragraphs: [
      {
        id: "q1",
        text: "CSV インポートについて確認です。一部の行にエラーがあった場合、インポート全体が止まってしまうのでしょうか？",
      },
      {
        id: "q2",
        text: "また、社内では SSO でログインしています。この環境でも API キーを発行して、外部システムから連携できますか？",
      },
      {
        id: "q3",
        text: "インポートしたデータがいつまで保存され、解約時にどう扱われるかも教えてください。",
      },
      {
        id: "q4",
        text: "初期設定に不安があるので、手伝っていただける窓口があれば知りたいです。",
      },
    ],
  },
  reply: {
    to: "田中 様",
    subject: "Re: CSV インポートの仕様と、初期設定について",
    opening: "田中 様",
    closing: "CRE サポートチーム",
    paragraphs: [
      {
        id: "r1",
        topic: "エラー行があるときの取り込み",
        text: "お問い合わせありがとうございます。エラーのある行が含まれていても、正しい行の取り込みは継続されます。エラーとなった行は、取り込み結果の画面からご確認いただけます。",
        respondsTo: ["q1"],
        status: "verified",
        method: "一次情報で確認",
        summary: "実装と公式ヘルプの説明が一致しています。対象バージョンの確認も完了しています。",
        checks: [
          {
            label: "実装と説明が一致している",
            result: "ok",
            note: "行ごとに検証し、失敗した行だけを除外",
          },
          { label: "対象バージョン", result: "ok", note: "現行バージョン（v4 系）で確認" },
          { label: "根拠の鮮度", result: "ok", note: "1 日前に確認" },
          {
            label: "言い切りすぎていないか",
            result: "ok",
            note: "例外となる条件は見つかっていません",
          },
        ],
        conditions: "CSV インポート / 標準インポーター",
        evidence: [
          {
            type: "code",
            stance: "supports",
            title: "行単位のエラーハンドリング",
            excerpt: "if (!result.ok) { failed.push(result); continue; }",
            source: "packages/importer/src/run.ts",
            checkedAt: "2026-10-05T10:00:00+09:00",
          },
          {
            type: "help",
            stance: "supports",
            title: "インポート中にエラーが発生したとき",
            excerpt: "エラーのある行はスキップされ、それ以外の行は取り込まれます。",
            source: "公式ヘルプ / データの取り込み",
            checkedAt: "2026-10-05T10:00:00+09:00",
          },
        ],
        nextAction: "この段落に追加の確認はありません。",
        owners: ["開発担当", "CS担当"],
      },
      {
        id: "r2",
        topic: "SSO 環境での API キー発行",
        text: "SSO をご利用の環境でも、API キーを発行できます。ただし、管理者が「SSO の強制」を有効にしている場合は、組織の設定で API キーの発行を許可する必要があります。ご利用の設定をお知らせいただけますでしょうか。",
        respondsTo: ["q2"],
        status: "conditional",
        method: "社内FAQ と先行事例で確認",
        summary:
          "発行はできますが、組織の設定によって手順が変わります。お客様の設定の確認が必要です。",
        checks: [
          { label: "発行できること", result: "ok", note: "社内FAQ" },
          { label: "お客様の設定", result: "warn", note: "SSO の強制が有効かどうかは未確認" },
          { label: "根拠の鮮度", result: "ok", note: "12 日前に確認" },
        ],
        conditions: "SSO の強制が有効な組織では、管理者の許可が必要",
        evidence: [
          {
            type: "faq",
            stance: "conditional",
            title: "SSO 利用時の API キー",
            excerpt: "SSO の強制が有効な場合、組織の設定で API キーの発行を許可してください。",
            source: "社内FAQ / 認証",
            checkedAt: "2026-09-24T10:00:00+09:00",
          },
          {
            type: "precedent",
            stance: "supports",
            title: "先行事例 #4821",
            excerpt: "SSO 強制の組織で、管理者が許可したあとに発行できたことを確認",
            source: "問い合わせ管理",
          },
        ],
        nextAction: "お客様から設定の状況を聞いたら、手順を案内する。",
        owners: ["CS担当"],
      },
      {
        id: "r3",
        topic: "データの保存期間と削除",
        text: "インポートしたデータの保存期間と、解約時の取り扱いについては、ご契約内容を確認のうえ、改めてご案内いたします。現時点では保存期間を確約することができません。",
        respondsTo: ["q3"],
        status: "recheck",
        method: "利用規約と実装を照合",
        summary:
          "利用規約の記載と削除処理の実装が食い違っている可能性があります。最新の内容を確認してください。",
        checks: [
          { label: "規約の記載", result: "ok", note: "利用規約 第 12 条" },
          { label: "実装との一致", result: "ng", note: "削除処理の保持日数が規約と異なる" },
          { label: "根拠の鮮度", result: "warn", note: "実装の確認が 45 日前" },
          { label: "契約による違い", result: "warn", note: "個別契約の有無が未確認" },
        ],
        conditions: "標準の利用規約で契約している場合",
        evidence: [
          {
            type: "terms",
            stance: "supports",
            title: "利用規約 第 12 条（契約終了後のデータの取扱い）",
            excerpt: "当社は、契約終了日から 30 日を経過した後、お客様データを削除します。",
            source: "利用規約 2026 年 4 月版",
          },
          {
            type: "code",
            stance: "contradicts",
            title: "解約組織のデータ削除ジョブ",
            excerpt: "const RETENTION_DAYS = 60;",
            source: "apps/worker/src/jobs/purge-organizations.ts",
            checkedAt: "2026-08-22T09:00:00+09:00",
          },
        ],
        nextAction: "開発担当に保持日数を確認し、規約と実装のどちらが正しいかを決める。",
        owners: ["開発担当", "法務担当"],
      },
      {
        id: "r4",
        topic: "初期設定のサポート",
        text: "設定にご不安がある場合は、サポート窓口で設定内容をご一緒に確認できます。取り込みたいファイルの形式と、設定画面の状況をお知らせください。パスワードなどの認証情報はお送りいただく必要はありません。",
        respondsTo: ["q4"],
        status: "verified",
        method: "社内ルールで確認",
        summary: "設定サポートの運用ルールと一致しています。",
        checks: [
          {
            label: "提供しているサポートか",
            result: "ok",
            note: "社内ルール「設定サポートの運用」",
          },
          {
            label: "認証情報を求めていないか",
            result: "ok",
            note: "パスワードは受け取らない運用",
          },
        ],
        evidence: [
          {
            type: "internal-rule",
            stance: "supports",
            title: "設定サポートの運用",
            excerpt: "画面共有またはスクリーンショットで設定を確認する。認証情報は受け取らない。",
            source: "社内 Wiki / サポート運用",
            checkedAt: "2026-10-01T10:00:00+09:00",
          },
        ],
        nextAction: "この段落に追加の確認はありません。",
        owners: ["CS担当"],
      },
    ],
  },
};
