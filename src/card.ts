import { join } from "node:path";
import sharp from "sharp";
import type { RobloxLink } from "./db.js";
import type { BalanceSummary, PurchaseRecord } from "./types.js";
import { escapeXml, truncate } from "./utils.js";

const CARD_WIDTH = 1063;
const CARD_HEIGHT = 522;
const ARTWORK_PATH = join(
  process.cwd(),
  "assets",
  "purchase-card-template.png"
);

let artworkPromise: Promise<Buffer> | null = null;

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

function loadArtwork(): Promise<Buffer> {
  if (artworkPromise) return artworkPromise;

  artworkPromise = sharp(ARTWORK_PATH)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .png()
    .toBuffer();

  return artworkPromise;
}

function dynamicImage(input: {
  uri: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clipId: string;
  fallback: string;
}): string {
  if (input.uri) {
    return `<image
      href="${input.uri}"
      x="${input.x}"
      y="${input.y}"
      width="${input.width}"
      height="${input.height}"
      preserveAspectRatio="xMidYMid slice"
      clip-path="url(#${input.clipId})"
    />`;
  }

  return `<g clip-path="url(#${input.clipId})">
    <rect
      x="${input.x}"
      y="${input.y}"
      width="${input.width}"
      height="${input.height}"
      fill="url(#placeholderFill)"
    />
    <circle
      cx="${input.x + input.width / 2}"
      cy="${input.y + input.height / 2 - 8}"
      r="22"
      fill="#fffaf7"
      fill-opacity="0.68"
    />
    <path
      d="M ${input.x + input.width / 2 - 10} ${input.y + input.height / 2 - 18}
         h 20 v 20 h -20 z
         M ${input.x + input.width / 2 - 3} ${input.y + input.height / 2 - 11}
         h 6 v 6 h -6 z"
      fill="#6b6465"
      fill-rule="evenodd"
      transform="rotate(12 ${input.x + input.width / 2} ${input.y + input.height / 2 - 8})"
    />
    <text
      x="${input.x + input.width / 2}"
      y="${input.y + input.height - 14}"
      text-anchor="middle"
      class="fallbackText"
    >${escapeXml(input.fallback)}</text>
  </g>`;
}

function valueFontSize(value: number, normal: number): number {
  const length = value.toLocaleString("id-ID").length;

  if (length >= 10) return normal - 7;
  if (length >= 8) return normal - 4;
  if (length >= 6) return normal - 2;
  return normal;
}

function robuxIcon(x: number, y: number, size: number, pink = false): string {
  const color = pink ? "#e7a9b5" : "#625c5d";
  const inner = size * 0.34;
  const offset = (size - inner) / 2;

  return `<g transform="translate(${x} ${y}) rotate(30 ${size / 2} ${size / 2})">
    <rect
      x="2"
      y="2"
      width="${size - 4}"
      height="${size - 4}"
      rx="${size * 0.2}"
      fill="none"
      stroke="${color}"
      stroke-width="${Math.max(2, size * 0.11)}"
    />
    <rect
      x="${offset}"
      y="${offset}"
      width="${inner}"
      height="${inner}"
      rx="${inner * 0.18}"
      fill="${color}"
    />
  </g>`;
}

function copyIcon(x: number, y: number): string {
  return `<g
    fill="none"
    stroke="#615b5c"
    stroke-width="1.4"
    stroke-linejoin="round"
    opacity="0.78"
  >
    <rect x="${x + 3}" y="${y}" width="9" height="11" rx="2"/>
    <path d="M ${x + 9} ${y + 4} h 4 a 2 2 0 0 1 2 2 v 7 a 2 2 0 0 1 -2 2 h -6 a 2 2 0 0 1 -2 -2 v -2"/>
  </g>`;
}

export async function renderPurchaseCard(input: {
  purchase: PurchaseRecord;
  link: RobloxLink | null;
  balance: BalanceSummary;
  avatarUrl: string | null;
  itemUrl: string | null;
}): Promise<Buffer> {
  const { purchase, balance } = input;

  const [artwork, avatar, item] = await Promise.all([
    loadArtwork(),
    imageDataUri(input.avatarUrl),
    imageDataUri(input.itemUrl)
  ]);

  const totalSpentSize = valueFontSize(balance.totalSpent, 27);
  const totalCashbackSize = valueFontSize(balance.totalCashback, 27);
  const bottomCashbackSize = valueFontSize(balance.totalCashback, 36);

  const overlay = `
  <svg
    width="${CARD_WIDTH}"
    height="${CARD_HEIGHT}"
    viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath id="itemClip">
        <rect x="378" y="260" width="126" height="112" rx="15"/>
      </clipPath>

      <clipPath id="avatarClip">
        <circle cx="558" cy="271" r="25"/>
      </clipPath>

      <linearGradient id="mainPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#eee7e4"/>
        <stop offset="0.52" stop-color="#ded5d3"/>
        <stop offset="1" stop-color="#c9bfbd"/>
      </linearGradient>

      <linearGradient id="subPanel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffaf7" stop-opacity="0.86"/>
        <stop offset="1" stop-color="#e9e0dd" stop-opacity="0.72"/>
      </linearGradient>

      <linearGradient id="placeholderFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#b8aeac"/>
        <stop offset="1" stop-color="#877f80"/>
      </linearGradient>

      <linearGradient id="bottomPanel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5d5859" stop-opacity="0.92"/>
        <stop offset="0.55" stop-color="#756e6f" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#4f4a4b" stop-opacity="0.94"/>
      </linearGradient>

      <linearGradient id="cashText" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff9f6"/>
        <stop offset="0.46" stop-color="#f7d4da"/>
        <stop offset="1" stop-color="#df9eab"/>
      </linearGradient>

      <filter id="panelShadow" x="-20%" y="-25%" width="140%" height="150%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#251f20" flood-opacity="0.28"/>
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#fff7f1" flood-opacity="0.34"/>
      </filter>

      <filter id="softShadow" x="-20%" y="-30%" width="140%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#463f40" flood-opacity="0.18"/>
      </filter>

      <filter id="cashGlow" x="-50%" y="-100%" width="200%" height="300%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#fff4f1" flood-opacity="0.82"/>
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#bf7584" flood-opacity="0.35"/>
      </filter>
    </defs>

    <style>
      text {
        font-family: 'Fredoka', 'DejaVu Sans', sans-serif;
      }

      .label {
        fill: #746d6e;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0.25px;
      }

      .value {
        fill: #504a4b;
        font-weight: 700;
      }

      .fallbackText {
        fill: #fffaf7;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.8px;
      }
    </style>

    <!-- Seluruh UI transaksi dibangun ulang. Area data lama tertutup penuh. -->
    <rect
      x="356"
      y="226"
      width="686"
      height="224"
      rx="26"
      fill="url(#mainPanel)"
      stroke="#fff8f3"
      stroke-width="3"
      filter="url(#panelShadow)"
    />

    <rect
      x="363"
      y="233"
      width="672"
      height="210"
      rx="21"
      fill="none"
      stroke="#ffffff"
      stroke-opacity="0.48"
      stroke-width="1.2"
    />

    <!-- Kartu item. -->
    <rect
      x="372"
      y="247"
      width="139"
      height="189"
      rx="18"
      fill="url(#subPanel)"
      stroke="#fffaf7"
      stroke-opacity="0.82"
      stroke-width="1.5"
      filter="url(#softShadow)"
    />

    ${dynamicImage({
      uri: item,
      x: 378,
      y: 260,
      width: 126,
      height: 112,
      clipId: "itemClip",
      fallback: "ITEM PREVIEW"
    })}

    <rect
      x="378"
      y="260"
      width="126"
      height="112"
      rx="15"
      fill="none"
      stroke="#fffaf7"
      stroke-opacity="0.82"
      stroke-width="1.5"
    />

    <rect
      x="382"
      y="383"
      width="118"
      height="27"
      rx="13.5"
      fill="#6e6768"
      fill-opacity="0.76"
      stroke="#fffaf7"
      stroke-opacity="0.42"
    />

    <text
      x="441"
      y="401"
      text-anchor="middle"
      fill="#fffaf7"
      font-size="11"
      font-weight="700"
      letter-spacing="0.4"
    >NEKOBUXX SHOP</text>

    <!-- Identitas pembeli. -->
    <rect
      x="522"
      y="238"
      width="507"
      height="68"
      rx="17"
      fill="url(#subPanel)"
      stroke="#fffaf7"
      stroke-opacity="0.72"
      stroke-width="1.4"
    />

    ${dynamicImage({
      uri: avatar,
      x: 533,
      y: 246,
      width: 50,
      height: 50,
      clipId: "avatarClip",
      fallback: "USER"
    })}

    <circle
      cx="558"
      cy="271"
      r="25"
      fill="none"
      stroke="#fffaf7"
      stroke-opacity="0.9"
      stroke-width="2"
    />

    <text x="598" y="259" class="label">Dibeli oleh</text>
    <text x="598" y="284" class="value" font-size="20">
      ${escapeXml(truncate(purchase.robloxUsername, 17))}
    </text>
    ${copyIcon(747, 269)}

    <line
      x1="807"
      y1="248"
      x2="807"
      y2="296"
      stroke="#877f80"
      stroke-opacity="0.22"
    />

    ${robuxIcon(827, 253, 34)}
    <text x="880" y="259" class="label">Roblox ID</text>
    <text x="880" y="284" class="value" font-size="17">
      ${purchase.robloxUserId}
    </text>
    ${copyIcon(1001, 269)}

    <!-- Detail item. -->
    <rect
      x="522"
      y="313"
      width="296"
      height="130"
      rx="17"
      fill="url(#subPanel)"
      stroke="#fffaf7"
      stroke-opacity="0.7"
      stroke-width="1.4"
    />

    ${robuxIcon(538, 332, 18)}
    <text x="568" y="346" class="label">Nama Item</text>
    <text x="659" y="346" class="label">:</text>
    <text x="676" y="346" class="value" font-size="15">
      ${escapeXml(truncate(purchase.assetName, 17))}
    </text>

    ${robuxIcon(538, 368, 18)}
    <text x="568" y="382" class="label">Item ID</text>
    <text x="659" y="382" class="label">:</text>
    <text x="676" y="382" class="value" font-size="15">
      ${purchase.assetId}
    </text>

    ${robuxIcon(538, 403, 18)}
    <text x="568" y="417" class="label">Harga Item</text>
    <text x="659" y="417" class="label">:</text>
    <text x="676" y="417" class="value" font-size="17">
      R$ ${purchase.priceRobux.toLocaleString("id-ID")}
    </text>
    ${robuxIcon(759, 403, 18)}

    <!-- Ringkasan saldo. -->
    <rect
      x="825"
      y="313"
      width="204"
      height="130"
      rx="17"
      fill="url(#subPanel)"
      stroke="#fffaf7"
      stroke-opacity="0.7"
      stroke-width="1.4"
    />

    <text x="879" y="337" class="label">Total Belanja</text>
    ${robuxIcon(843, 343, 29)}
    <text x="884" y="371" class="value" font-size="${totalSpentSize}">
      R$ ${balance.totalSpent.toLocaleString("id-ID")}
    </text>

    <line
      x1="840"
      y1="383"
      x2="1015"
      y2="383"
      stroke="#81797a"
      stroke-opacity="0.26"
    />

    <text x="879" y="404" class="label" fill="#be7f8b">Total Cashback</text>
    ${robuxIcon(843, 408, 29, true)}
    <text
      x="884"
      y="433"
      fill="#d88695"
      font-size="${totalCashbackSize}"
      font-weight="700"
    >R$ ${balance.totalCashback.toLocaleString("id-ID")}</text>

    <!-- Total cashback bawah, dibangun ulang penuh. -->
    <rect
      x="356"
      y="456"
      width="686"
      height="61"
      rx="27"
      fill="url(#bottomPanel)"
      stroke="#fff8f3"
      stroke-opacity="0.78"
      stroke-width="1.8"
      filter="url(#panelShadow)"
    />

    ${robuxIcon(389, 468, 36)}
    <text
      x="447"
      y="494"
      fill="#fffaf7"
      font-size="19"
      font-weight="700"
      letter-spacing="0.3"
    >Total Cashback Diterima</text>

    <rect
      x="787"
      y="464"
      width="244"
      height="45"
      rx="22.5"
      fill="#736c6d"
      fill-opacity="0.72"
      stroke="#fffaf7"
      stroke-opacity="0.52"
    />

    <text
      x="909"
      y="499"
      text-anchor="middle"
      fill="url(#cashText)"
      font-size="${bottomCashbackSize}"
      font-weight="700"
      stroke="#fffaf5"
      stroke-opacity="0.3"
      stroke-width="1"
      paint-order="stroke fill"
      filter="url(#cashGlow)"
    >R$ ${balance.totalCashback.toLocaleString("id-ID")}</text>
  </svg>`;

  return sharp(artwork)
    .composite([
      {
        input: Buffer.from(overlay),
        top: 0,
        left: 0
      }
    ])
    .png()
    .toBuffer();
}
