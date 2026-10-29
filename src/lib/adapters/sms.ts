/** SMS adapter. Live driver expects SMS_API_KEY; otherwise records to the outbox. */

import { recordOutbox, type OutboxRow } from "./index";

export function sendSms(
  to: string,
  body: string,
  toLabel?: string,
  meta?: Record<string, any>,
): OutboxRow {
  // Live driver (SMS_API_KEY present) would POST to the gateway here.
  return recordOutbox({ channel: "sms", to, toLabel, body, meta, subject: "Docmate alert" });
}
