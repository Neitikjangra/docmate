/** Automated voice-call adapter for SOS (PRD 8.4). Live driver expects CALL_API_KEY. */

import { recordOutbox, type OutboxRow } from "./index";

export type CallScript = {
  personName: string;
  reason: string;
  when: string;
  location?: string | null;
};

export function placeCall(to: string, script: CallScript, toLabel?: string): OutboxRow {
  const spoken =
    `This is an automated Docmate emergency call. ${script.personName} triggered an emergency alert ` +
    `at ${script.when}. Reason: ${script.reason}.` +
    (script.location ? ` Last known location: ${script.location}.` : "") +
    ` Please call back immediately. In an emergency dial 108.`;
  return recordOutbox({
    channel: "call",
    to,
    toLabel,
    subject: "Automated SOS call",
    body: spoken,
    meta: { script, voice: "en-IN", repeat: 2 },
  });
}
