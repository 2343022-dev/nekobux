import { join } from "node:path";
import sharp from "sharp";
import { escapeXml, truncate } from "./utils.js";

const CARD_WIDTH = 1063;
const CARD_HEIGHT = 522;
const ARTWORK_PATH = join(process.cwd(), "assets", "purchase-card-template.png");

export interface NekobuxLogField {
  label: string;
  value: string;
}

export interface NekobuxLogCardInput {
  section: string;
  title: string;
  badge: string;
  profileName: string;
  profileId: string;
  profileAvatarUrl: string | null;
  accent: string;
  fields: NekobuxLogField[];
  bottomLabel: string;
  bottomValue: string;
  bottomRightLabel: string;
  bottomRightValue: string;
  createdAt: Date;
}

let artworkPromise: Promise<Buffer> | null = null;

function loadArtwork(): Promise<Buffer> {
  if (!artworkPromise) {
    artworkPromise = sharp(ARTWORK_PATH)
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
      .png()
      .toBuffer();
  }
  return artworkPromise;
}

async function imageDataUri(url: string | null): Promise<string> {
  if (!url) return "";
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/png";
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `data:${contentType};base64,${data}`;
  } catch {
    return "";
  }
}

function fieldMarkup(field: NekobuxLogField, index: number): string {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const x = 369 + column * 334;
  const y = 311 + row * 44;

  return `
    <rect x="${x}" y="${y}" width="323" height="38" rx="11"
      fill="url(#subPanel)" stroke="#fffaf7" stroke-opacity="0.58"/>
    <text x="${x + 13}" y="${y + 14}" class="fieldLabel">
      ${escapeXml(truncate(field.label.toUpperCase(), 24))}
    </text>
    <text x="${x + 13}" y="${y + 30}" class="fieldValue">
      ${escapeXml(truncate(field.value, 39))}
    </text>`;
}

function avatarMarkup(uri: string): string {
  if (uri) {
    return `<image href="${uri}" x="371" y="243" width="52" height="52"
      preserveAspectRatio="xMidYMid slice" clip-path="url(#profileClip)"/>`;
  }

  return `<circle cx="397" cy="269" r="26" fill="#756e70"/>
    <text x="397" y="277" text-anchor="middle" class="avatarFallback">N</text>`;
}

export async function renderNekobuxLogCard(
  input: NekobuxLogCardInput
): Promise<Buffer> {
  const [artwork, profileAvatar] = await Promise.all([
    loadArtwork(),
    imageDataUri(input.profileAvatarUrl)
  ]);

  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(input.createdAt);

  const fields = input.fields.slice(0, 6);
  const overlay = `
  <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}"
    viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="profileClip">
        <circle cx="397" cy="269" r="26"/>
      </clipPath>
      <linearGradient id="mainPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d3c9c6"/>
        <stop offset="0.5" stop-color="#bdb4b2"/>
        <stop offset="1" stop-color="#aaa2a1"/>
      </linearGradient>
      <linearGradient id="subPanel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f3e9e5" stop-opacity="0.94"/>
        <stop offset="1" stop-color="#d4cbca" stop-opacity="0.94"/>
      </linearGradient>
      <linearGradient id="bottomPanel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6e6869"/>
        <stop offset="0.52" stop-color="#8a8283"/>
        <stop offset="1" stop-color="#625d5e"/>
      </linearGradient>
      <filter id="panelShadow" x="-20%" y="-30%" width="140%" height="160%">
        <feDropShadow dx="0" dy="7" stdDeviation="9"
          flood-color="#292324" flood-opacity="0.34"/>
      </filter>
      <filter id="softGlow" x="-40%" y="-80%" width="180%" height="260%">
        <feDropShadow dx="0" dy="0" stdDeviation="3"
          flood-color="#fff7ef" flood-opacity="0.8"/>
      </filter>
    </defs>

    <style>
      text { font-family: 'DejaVu Sans', sans-serif; }
      .section { fill: #756e70; font-size: 10px; font-weight: 700; letter-spacing: 1.6px; }
      .title { fill: #4c4748; font-size: 19px; font-weight: 700; }
      .profileName { fill: #514b4c; font-size: 13px; font-weight: 700; }
      .profileId { fill: #797173; font-size: 9px; font-weight: 500; }
      .badge { fill: #fffaf7; font-size: 10px; font-weight: 700; letter-spacing: 0.7px; }
      .fieldLabel { fill: #857c7e; font-size: 8px; font-weight: 600; letter-spacing: 0.5px; }
      .fieldValue { fill: #504a4b; font-size: 11px; font-weight: 700; }
      .bottomLabel { fill: #ded5d3; font-size: 9px; font-weight: 600; letter-spacing: 1px; }
      .bottomValue { fill: #fffaf7; font-size: 16px; font-weight: 700; }
      .bottomRightValue { fill: #fff5ed; font-size: 20px; font-weight: 700; }
      .date { fill: #756e70; font-size: 8px; font-weight: 600; }
      .avatarFallback { fill: #fffaf7; font-size: 20px; font-weight: 700; }
    </style>

    <rect x="356" y="226" width="686" height="224" rx="26"
      fill="url(#mainPanel)" stroke="#fff8f3" stroke-width="2"
      filter="url(#panelShadow)"/>
    <rect x="363" y="233" width="672" height="210" rx="21"
      fill="none" stroke="#ffffff" stroke-opacity="0.48"/>

    <rect x="365" y="238" width="670" height="64" rx="18"
      fill="url(#subPanel)" stroke="#fffaf7" stroke-opacity="0.72"/>
    ${avatarMarkup(profileAvatar)}
    <circle cx="397" cy="269" r="26" fill="none"
      stroke="#fffaf7" stroke-width="2"/>

    <text x="436" y="255" class="section">${escapeXml(truncate(input.section, 28))}</text>
    <text x="436" y="280" class="title">${escapeXml(truncate(input.title, 37))}</text>
    <text x="436" y="295" class="date">
      ${escapeXml(truncate(input.profileName, 18))} • ${escapeXml(date)} WIB
    </text>

    <rect x="771" y="250" width="248" height="39" rx="19.5"
      fill="${input.accent}" stroke="#fffaf7" stroke-opacity="0.62"/>
    <text x="895" y="275" class="badge" text-anchor="middle">
      ${escapeXml(truncate(input.badge, 27))}
    </text>

    ${fields.map(fieldMarkup).join("")}

    <rect x="356" y="456" width="686" height="61" rx="27"
      fill="url(#bottomPanel)" stroke="#fff8f3" stroke-opacity="0.82"
      stroke-width="1.8" filter="url(#panelShadow)"/>

    <circle cx="389" cy="486" r="17" fill="${input.accent}"
      stroke="#fff8ef" stroke-width="2"/>
    <circle cx="389" cy="486" r="6" fill="#fff8ef"/>

    <text x="417" y="479" class="bottomLabel">
      ${escapeXml(truncate(input.bottomLabel, 32))}
    </text>
    <text x="417" y="501" class="bottomValue">
      ${escapeXml(truncate(input.bottomValue, 31))}
    </text>

    <rect x="786" y="464" width="245" height="45" rx="22.5"
      fill="${input.accent}" fill-opacity="0.8"
      stroke="#fffaf7" stroke-opacity="0.58"/>
    <text x="804" y="480" class="bottomLabel">
      ${escapeXml(truncate(input.bottomRightLabel, 17))}
    </text>
    <text x="1013" y="498" class="bottomRightValue"
      text-anchor="end" filter="url(#softGlow)">
      ${escapeXml(truncate(input.bottomRightValue, 17))}
    </text>
  </svg>`;

  return sharp(artwork)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
