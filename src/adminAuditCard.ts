import sharp from "sharp";
import type { APIEmbedField } from "discord.js";
import { escapeXml, truncate } from "./utils.js";

async function imageDataUri(url: string | null): Promise<string> {
  if (!url) return "";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/png";
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `data:${contentType};base64,${data}`;
  } catch {
    return "";
  }
}

function plain(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, "")
    .replace(/<@!?(\d+)>/g, "Discord ID $1")
    .replace(/<#(\d+)>/g, "Channel ID $1")
    .replace(/<@&(\d+)>/g, "Role ID $1")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldCard(field: APIEmbedField, index: number): string {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const x = 425 + column * 365;
  const y = 171 + row * 106;
  const value = truncate(plain(field.value), 31);
  return `
    <rect x="${x}" y="${y}" width="340" height="88" rx="20"
      fill="#eeeae7" stroke="#c5bdbb" stroke-width="2"/>
    <text x="${x + 22}" y="${y + 30}" class="fieldLabel">
      ${escapeXml(truncate(plain(field.name).toUpperCase(), 28))}
    </text>
    <text x="${x + 22}" y="${y + 63}" class="fieldValue">
      ${escapeXml(value)}
    </text>`;
}

export async function renderAdminAuditCard(input: {
  title: string;
  command: string;
  adminName: string;
  adminDiscordId: string;
  adminAvatarUrl: string | null;
  color: number;
  fields: APIEmbedField[];
  createdAt: Date;
}): Promise<Buffer> {
  const avatar = await imageDataUri(input.adminAvatarUrl);
  const accent = `#${input.color.toString(16).padStart(6, "0").slice(-6)}`;
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short"
  }).format(input.createdAt);
  const visibleFields = input.fields.slice(0, 8);
  const avatarMarkup = avatar
    ? `<image href="${avatar}" x="95" y="156" width="220" height="220"
         preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>`
    : `<circle cx="205" cy="266" r="110" fill="#817a7d"/>
       <text x="205" y="290" text-anchor="middle" class="avatarFallback">?</text>`;

  const svg = `
  <svg width="1200" height="675" viewBox="0 0 1200 675"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f8f4f1"/>
        <stop offset="0.6" stop-color="#ddd7d4"/>
        <stop offset="1" stop-color="#bbb5b5"/>
      </linearGradient>
      <linearGradient id="brand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.5" stop-color="#f6ebe7"/>
        <stop offset="1" stop-color="#c2b1ab"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="16"
          flood-color="#514b4e" flood-opacity="0.23"/>
      </filter>
      <clipPath id="avatarClip">
        <circle cx="205" cy="266" r="110"/>
      </clipPath>
    </defs>

    <style>
      text { font-family: 'Fredoka', 'DejaVu Sans', sans-serif; font-weight: 700; }
      .brandDepth { font-size: 50px; fill: #968783; stroke: #857673; stroke-width: 3px; paint-order: stroke fill; }
      .brand { font-size: 50px; fill: url(#brand); stroke: #fffaf7; stroke-width: 2px; paint-order: stroke fill; }
      .eyebrow { font-size: 15px; letter-spacing: 2.3px; fill: #6a6467; }
      .profileLabel { font-size: 15px; letter-spacing: 1.4px; fill: #d8d0d1; }
      .adminName { font-size: 31px; fill: #fffaf8; }
      .adminId { font-size: 16px; fill: #d7cfd1; }
      .command { font-size: 22px; fill: #fffaf8; }
      .actionLabel { font-size: 15px; letter-spacing: 1.7px; fill: #70696c; }
      .actionTitle { font-size: 24px; fill: #4f494c; }
      .fieldLabel { font-size: 14px; letter-spacing: 0.7px; fill: #7a7275; }
      .fieldValue { font-size: 17px; fill: #504a4d; }
      .footer { font-size: 15px; fill: #686164; }
      .avatarFallback { font-size: 100px; fill: #ded7d5; }
    </style>

    <g filter="url(#shadow)">
      <rect x="20" y="20" width="1160" height="635" rx="42" fill="url(#background)"/>
      <path d="M20 20 H385 V655 H20 Z" fill="#686367"/>
      <path d="M20 566 C155 520 260 690 405 618 V655 H20 Z"
        fill="${accent}" fill-opacity="0.2"/>
    </g>
    <rect x="22" y="22" width="1156" height="631" rx="40"
      fill="none" stroke="#777174" stroke-opacity="0.5" stroke-width="2"/>
    <rect x="385" y="20" width="9" height="635" fill="${accent}"/>

    <text x="425" y="75" class="brandDepth">NEKOBUX</text>
    <text x="421" y="69" class="brand">NEKOBUX</text>
    <text x="421" y="101" class="eyebrow">SECURE ADMIN AUDIT</text>

    <text x="68" y="82" class="profileLabel">ACTION PERFORMED BY</text>
    ${avatarMarkup}
    <circle cx="205" cy="266" r="112" fill="none" stroke="#f2e7e4" stroke-width="4"/>
    <text x="68" y="425" class="adminName">${escapeXml(truncate(input.adminName, 18))}</text>
    <text x="68" y="458" class="adminId">DISCORD ID ${input.adminDiscordId}</text>
    <rect x="68" y="492" width="270" height="2" fill="#ffffff" fill-opacity="0.17"/>
    <text x="68" y="530" class="profileLabel">COMMAND</text>
    <text x="68" y="566" class="command">/${escapeXml(truncate(input.command, 24))}</text>

    <text x="790" y="65" class="actionLabel">RECORDED ACTION</text>
    <text x="790" y="103" class="actionTitle">${escapeXml(truncate(plain(input.title), 25))}</text>
    <rect x="421" y="128" width="719" height="5" rx="2.5" fill="${accent}"/>

    ${visibleFields.map(fieldCard).join("")}

    <line x1="421" y1="607" x2="1140" y2="607"
      stroke="#6f696c" stroke-opacity="0.25"/>
    <text x="421" y="637" class="footer">${escapeXml(date)} WIB</text>
    <text x="1140" y="637" text-anchor="end" class="footer">
      VERIFIED • TRACKED • SECURE
    </text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
