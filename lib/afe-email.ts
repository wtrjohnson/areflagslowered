export type InboundEmail = {
  raw: string;
  headers: Record<string, string>;
  subject: string;
  sender: string;
  recipient: string;
  messageId: string;
  plainText: string;
  html: string;
  contentHash: string;
};

// A synchronous, runtime-neutral content fingerprint. It is used for
// idempotency, not for authentication; webhook authentication uses the shared
// secret in the route.
export function hashText(value: string) {
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    for (let slot = 0; slot < words.length; slot += 1) {
      words[slot] ^= (code + slot * 17) & 0xff;
      words[slot] = Math.imul(words[slot], 0x01000193 + slot * 2) >>> 0;
    }
  }
  return words.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBody(value: string, encoding?: string) {
  if (encoding?.toLowerCase().includes("quoted-printable")) return decodeQuotedPrintable(value);
  if (encoding?.toLowerCase().includes("base64")) return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf8");
  return value;
}

function unfoldHeaders(raw: string) {
  const separator = raw.search(/\r?\n\r?\n/);
  const headerText = separator >= 0 ? raw.slice(0, separator) : raw;
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}

function bodyParts(raw: string, headers: Record<string, string>) {
  const separator = raw.search(/\r?\n\r?\n/);
  const body = separator >= 0 ? raw.slice(separator).replace(/^\r?\n\r?\n/, "") : "";
  const contentType = headers["content-type"] || "";
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary) return { plainText: decodeBody(body, headers["content-transfer-encoding"]), html: "" };
  const parts = body.split(`--${boundary}`).map((part) => part.replace(/^\r?\n|\r?\n--\r?\n?$/g, ""));
  let plainText = "";
  let html = "";
  for (const part of parts) {
    const [partHeaderText, ...bodyLines] = part.split(/\r?\n\r?\n/);
    if (!bodyLines.length) continue;
    const partHeaders = unfoldHeaders(partHeaderText || "");
    const partBody = decodeBody(bodyLines.join("\n"), partHeaders["content-transfer-encoding"]);
    if (/text\/plain/i.test(partHeaders["content-type"] || "")) plainText = partBody;
    if (/text\/html/i.test(partHeaders["content-type"] || "")) html = partBody;
  }
  return { plainText, html };
}

export function parseInboundEmail(raw: string): InboundEmail {
  const headers = unfoldHeaders(raw);
  const parts = bodyParts(raw, headers);
  return {
    raw,
    headers,
    subject: headers.subject || "",
    sender: headers.from || headers.sender || "",
    recipient: headers.to || "",
    messageId: headers["message-id"] || "",
    ...parts,
    contentHash: hashText(raw),
  };
}

export function emailText(email: InboundEmail) {
  return [email.subject, email.plainText, email.html.replace(/<[^>]+>/g, " ")].filter(Boolean).join("\n").replace(/\s+/g, " ").trim();
}
