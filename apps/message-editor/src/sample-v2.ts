import type { ReplyReviewPayloadV2 } from "@cre/editor-payload";
import { samplePayload } from "./sample.ts";

/**
 * version 2（本文の一部ごとに判定する形）の見本。問い合わせと根拠は version 1 の見本（sample.ts）と同じものを使う。
 * 問い合わせ・根拠・確認結果はすべて架空。
 */
const [r1, r2, r3, r4] = samplePayload.reply.paragraphs;
const evidenceOf = (paragraph: typeof r1, title: string) =>
  paragraph!.evidence.filter((e) => e.title === title);

export const samplePayloadV2: ReplyReviewPayloadV2 = {
  version: 2,
  generatedAt: samplePayload.generatedAt,
  model: samplePayload.model,
  inquiry: samplePayload.inquiry,
  reply: {
    to: samplePayload.reply.to,
    subject: samplePayload.reply.subject,
    opening: samplePayload.reply.opening,
    closing: samplePayload.reply.closing,
    paragraphs: [
      {
        id: "r1",
        respondsTo: ["q1"],
        parts: [
          { text: "お問い合わせありがとうございます。" },
          {
            assertion: {
              id: "a1",
              text: "エラーのある行が含まれていても、正しい行の取り込みは継続されます。",
              status: "verified",
              topic: "エラー行があるときの取り込み",
              summary: r1!.summary,
              method: r1!.method,
              checks: r1!.checks,
              evidence: r1!.evidence,
            },
          },
          { text: "エラーとなった行は、取り込み結果の画面からご確認いただけます。" },
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
              checks: [r2!.checks[0]!],
              evidence: evidenceOf(r2, "SSO 利用時の API キー"),
            },
          },
          {
            assertion: {
              id: "a3",
              text: "ただし、管理者が「SSO の強制」を有効にしている場合は、組織の設定で API キーの発行を許可する必要があります。",
              status: "conditional",
              topic: "SSO の強制が有効なときの手順",
              summary: "お客様の組織で「SSO の強制」が有効かどうかで、手順が変わります。",
              method: r2!.method,
              conditions: r2!.conditions,
              checks: r2!.checks.slice(1),
              evidence: r2!.evidence,
              nextAction: r2!.nextAction,
              owners: r2!.owners,
            },
          },
          { text: "ご利用の設定をお知らせいただけますでしょうか。" },
        ],
      },
      {
        id: "r3",
        respondsTo: ["q3"],
        parts: [
          { text: "インポートしたデータは、ご解約日から" },
          {
            gap: {
              id: "g1",
              question: "解約後、何日でデータを削除するか",
              guidance:
                "利用規約と削除処理の実装で日数が食い違っています。どちらが正しいかを確かめ、日数を書いてください。",
              options: [
                { label: "30 日（利用規約）", evidence: evidenceOf(r3, r3!.evidence[0]!.title) },
                {
                  label: "60 日（削除処理の実装）",
                  evidence: evidenceOf(r3, r3!.evidence[1]!.title),
                },
              ],
              owners: r3!.owners,
            },
          },
          { text: "を経過した後に削除いたします。" },
          {
            assertion: {
              id: "a4",
              text: "個別のご契約がある場合は、その内容が優先されます。",
              status: "recheck",
              topic: "個別契約があるときの扱い",
              summary: "個別契約の有無と、その中の取り決めを確かめられていません。",
              conditions: r3!.conditions,
              checks: r3!.checks.filter((check) => check.label === "契約による違い"),
              evidence: evidenceOf(r3, r3!.evidence[0]!.title),
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
          { text: "設定にご不安がある場合は、" },
          {
            assertion: {
              id: "a5",
              text: "サポート窓口で設定内容をご一緒に確認できます。",
              status: "verified",
              topic: "初期設定のサポート",
              summary: r4!.summary,
              method: r4!.method,
              checks: [r4!.checks[0]!],
              evidence: r4!.evidence,
            },
          },
          { text: "取り込みたいファイルの形式と、設定画面の状況をお知らせください。" },
          {
            assertion: {
              id: "a6",
              text: "パスワードなどの認証情報はお送りいただく必要はありません。",
              status: "verified",
              topic: "認証情報を受け取らないこと",
              summary: "認証情報を受け取らない運用と一致しています。",
              method: r4!.method,
              checks: [r4!.checks[1]!],
              evidence: r4!.evidence,
            },
          },
        ],
      },
    ],
  },
};
