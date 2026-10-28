import type { ReplyReviewPayload } from "@cre/editor-payload";

/**
 * URL にデータがないときに表示する見本。ドキュメントのモック画像もこのデータで撮る。
 * 問い合わせ・根拠・確認結果はすべて架空。
 */
export const samplePayload: ReplyReviewPayload = {
  version: 2,
  generatedAt: "2026-10-06T10:00:00+09:00",
  model: {
    name: "decision-model（仮）",
    version: "0.1",
  },
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
        respondsTo: ["q1"],
        parts: [
          {
            text: "お問い合わせありがとうございます。",
          },
          {
            assertion: {
              id: "a1",
              text: "エラーのある行が含まれていても、正しい行の取り込みは継続されます。",
              status: "verified",
              topic: "エラー行があるときの取り込み",
              summary:
                "実装と公式ヘルプの説明が一致しています。対象バージョンの確認も完了しています。",
              method: "一次情報で確認",
              checks: [
                {
                  label: "実装と説明が一致している",
                  result: "ok",
                  note: "行ごとに検証し、失敗した行だけを除外",
                },
                {
                  label: "対象バージョン",
                  result: "ok",
                  note: "現行バージョン（v4 系）で確認",
                },
                {
                  label: "根拠の鮮度",
                  result: "ok",
                  note: "1 日前に確認",
                },
                {
                  label: "言い切りすぎていないか",
                  result: "ok",
                  note: "例外となる条件は見つかっていません",
                },
              ],
              evidence: [
                {
                  type: "code",
                  stance: "supports",
                  title: "行単位のエラーハンドリング",
                  excerpt: "if (!result.ok) { failed.push(result); continue; }",
                  source: "example/importer.ts（見本）",
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
            },
          },
          {
            text: "エラーとなった行は、取り込み結果の画面からご確認いただけます。",
          },
        ],
      },
      {
        id: "r2",
        respondsTo: ["q2"],
        parts: [
          {
            assertion: {
              id: "a2",
              text: "SSO をご利用の環境でも、API キーを発行できます。",
              status: "verified",
              topic: "SSO 環境での API キー発行",
              summary: "SSO を使っていても API キーを発行できることを、社内FAQ で確認しています。",
              method: "社内FAQ で確認",
              checks: [
                {
                  label: "発行できること",
                  result: "ok",
                  note: "社内FAQ",
                },
              ],
              evidence: [
                {
                  type: "faq",
                  stance: "conditional",
                  title: "SSO 利用時の API キー",
                  excerpt:
                    "SSO の強制が有効な場合、組織の設定で API キーの発行を許可してください。",
                  source: "社内FAQ（見本）/ 認証",
                  checkedAt: "2026-09-24T10:00:00+09:00",
                },
              ],
            },
          },
          {
            assertion: {
              id: "a3",
              text: "ただし、管理者が「SSO の強制」を有効にしている場合は、組織の設定で API キーの発行を許可する必要があります。",
              status: "conditional",
              topic: "SSO の強制が有効なときの手順",
              summary: "お客様の組織で「SSO の強制」が有効かどうかで、手順が変わります。",
              method: "社内FAQ と先行事例で確認",
              conditions: "SSO の強制が有効な組織では、管理者の許可が必要",
              checks: [
                {
                  label: "お客様の設定",
                  result: "warn",
                  note: "SSO の強制が有効かどうかは未確認",
                },
                {
                  label: "根拠の鮮度",
                  result: "ok",
                  note: "12 日前に確認",
                },
              ],
              evidence: [
                {
                  type: "faq",
                  stance: "conditional",
                  title: "SSO 利用時の API キー",
                  excerpt:
                    "SSO の強制が有効な場合、組織の設定で API キーの発行を許可してください。",
                  source: "社内FAQ（見本）/ 認証",
                  checkedAt: "2026-09-24T10:00:00+09:00",
                },
                {
                  type: "precedent",
                  stance: "supports",
                  title: "先行事例（見本）",
                  excerpt: "SSO 強制の組織で、管理者が許可したあとに発行できたことを確認",
                  source: "問い合わせ管理（見本）",
                },
              ],
              nextAction: "お客様から設定の状況を聞いたら、手順を案内する。",
              owners: ["CS担当"],
            },
          },
          {
            text: "ご利用の設定をお知らせいただけますでしょうか。",
          },
        ],
      },
      {
        id: "r3",
        respondsTo: ["q3"],
        parts: [
          {
            text: "インポートしたデータは、ご解約日から",
          },
          {
            gap: {
              id: "g1",
              question: "解約後、何日でデータを削除するか",
              guidance:
                "利用規約と削除処理の実装で日数が食い違っています。どちらが正しいかを確かめ、日数を書いてください。",
              options: [
                {
                  label: "30 日（利用規約）",
                  evidence: [
                    {
                      type: "terms",
                      stance: "supports",
                      title: "利用規約 第 12 条（契約終了後のデータの取扱い）",
                      excerpt:
                        "当社は、契約終了日から 30 日を経過した後、お客様データを削除します。",
                      source: "利用規約 2026 年 4 月版",
                    },
                  ],
                },
                {
                  label: "60 日（削除処理の実装）",
                  evidence: [
                    {
                      type: "code",
                      stance: "contradicts",
                      title: "データ削除ジョブ（見本）",
                      excerpt: "retentionDays: 60 // 見本の値",
                      source: "example/purge-job.ts（見本）",
                      checkedAt: "2026-08-22T09:00:00+09:00",
                    },
                  ],
                },
              ],
              owners: ["開発担当", "法務担当"],
            },
          },
          {
            text: "を経過した後に削除いたします。",
          },
          {
            assertion: {
              id: "a4",
              text: "個別のご契約がある場合は、その内容が優先されます。",
              status: "recheck",
              topic: "個別契約があるときの扱い",
              summary: "個別契約の有無と、その中の取り決めを確かめられていません。",
              conditions: "標準の利用規約で契約している場合",
              checks: [
                {
                  label: "契約による違い",
                  result: "warn",
                  note: "個別契約の有無が未確認",
                },
              ],
              evidence: [
                {
                  type: "terms",
                  stance: "supports",
                  title: "利用規約 第 12 条（契約終了後のデータの取扱い）",
                  excerpt: "当社は、契約終了日から 30 日を経過した後、お客様データを削除します。",
                  source: "利用規約 2026 年 4 月版",
                },
              ],
              nextAction: "お客様の契約に個別の取り決めがあるかを確認する。",
              owners: ["法務担当"],
            },
          },
        ],
      },
      {
        id: "r4",
        respondsTo: ["q4"],
        parts: [
          {
            text: "設定にご不安がある場合は、",
          },
          {
            assertion: {
              id: "a5",
              text: "サポート窓口で設定内容をご一緒に確認できます。",
              status: "verified",
              topic: "初期設定のサポート",
              summary: "設定サポートの運用ルールと一致しています。",
              method: "社内ルールで確認",
              checks: [
                {
                  label: "提供しているサポートか",
                  result: "ok",
                  note: "社内ルール「設定サポートの運用」",
                },
              ],
              evidence: [
                {
                  type: "internal-rule",
                  stance: "supports",
                  title: "設定サポートの運用",
                  excerpt:
                    "画面共有またはスクリーンショットで設定を確認する。認証情報は受け取らない。",
                  source: "社内 Wiki（見本）/ サポート運用",
                  checkedAt: "2026-10-01T10:00:00+09:00",
                },
              ],
            },
          },
          {
            text: "取り込みたいファイルの形式と、設定画面の状況をお知らせください。",
          },
          {
            assertion: {
              id: "a6",
              text: "パスワードなどの認証情報はお送りいただく必要はありません。",
              status: "verified",
              topic: "認証情報を受け取らないこと",
              summary: "認証情報を受け取らない運用と一致しています。",
              method: "社内ルールで確認",
              checks: [
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
                  excerpt:
                    "画面共有またはスクリーンショットで設定を確認する。認証情報は受け取らない。",
                  source: "社内 Wiki（見本）/ サポート運用",
                  checkedAt: "2026-10-01T10:00:00+09:00",
                },
              ],
            },
          },
        ],
      },
    ],
  },
};
