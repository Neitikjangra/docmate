/** Push adapter. Live driver expects PUSH_API_KEY; otherwise records to the outbox. */

import { recordOutbox, type OutboxRow } from "./index";

export function sendPush(
  to: string | null,
  title: string,
  body: string,
  meta?: Record<string, any>,
): OutboxRow {
  return recordOutbox({ channel: "push", to, subject: title, body, meta });
}
