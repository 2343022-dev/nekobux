import { join } from "node:path";
import sharp from "sharp";
import type { RobloxLink } from "./db.js";
import type { BalanceSummary, PurchaseRecord } from "./types.js";
import { escapeXml, truncate } from "./utils.js";

const CARD_WIDTH = 1063;
const CARD_HEIGHT = 522;
const IMAGE_REQUEST_TIMEOUT_MS = 25_000;
const ARTWORK_PATH = join(
  process.cwd(),
  "assets",
  "purchase-card-template.png" // Pastikan base template di sini adalah background silver polos dengan teks TRUSTED, CASHBACK 20%, FAST di atasnya
);

let artworkPromise: Promise<Buffer> | null = null;

async function imageDataUri(url: string | null): Promise<string> {
  if (!url) return "";

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "image/png";
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");

    return `data:${contentType};base64,${data}`;
  } catch {
    return "";
  }
}

async function itemImageDataUri(
  url: string | null,
  itemId: number,
  itemType: "asset" | "bundle"
): Promise<string> {
  const directImage = await imageDataUri(url);
  if (directImage) return directImage;

  const endpointTypes: Array<"asset" | "bundle"> =
    itemType === "bundle"
      ? ["bundle", "asset"]
      : ["asset", "bundle"];

  const candidates = await Promise.all(
    endpointTypes.map(async (endpointType): Promise<string> => {
      try {
        const endpoint = new URL(
          endpointType === "bundle"
            ? "https://thumbnails.roblox.com/v1/bundles/thumbnails"
            : "https://thumbnails.roblox.com/v1/assets"
        );

        endpoint.searchParams.set(
          endpointType === "bundle" ? "bundleIds" : "assetIds",
          String(itemId)
        );
        endpoint.searchParams.set("returnPolicy", "PlaceHolder");
        endpoint.searchParams.set("size", "420x420");
        endpoint.searchParams.set("format", "Png");
        endpoint.searchParams.set("isCircular", "false");

        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) return "";

        const payload = (await response.json()) as {
          data?: Array<{
            state?: string;
            imageUrl?: string | null;
          }>;
        };

        const thumbnail = payload.data?.[0];
        if (thumbnail?.state !== "Completed" || !thumbnail.imageUrl) {
          return "";
        }

        return imageDataUri(thumbnail.imageUrl);
      } catch {
        return "";
      }
    })
  );

  return candidates.find(Boolean) || "";
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
    <rect x="${input.x}" y="${input.y}" width="${input.width}" height="${input.height}" fill="url(#placeholderFill)" />
    <circle cx="${input.x + input.width / 2}" cy="${input.y + input.height / 2 - 8}" r="22" fill="#fffaf7" fill-opacity="0.68" />
    <text x="${input.x + input.width / 2}" y="${input.y + input.height - 14}" text-anchor="middle" class="fallbackText">${escapeXml(input.fallback)}</text>
  </g>`;
}

function valueFontSize(value: number, normal: number): number {
  const length = value.toLocaleString("id-ID").length;
  if (length >= 10) return normal - 7;
  if (length >= 8) return normal - 4;
  if (length >= 6) return normal - 2;
  return normal;
}

function robuxIcon(x: number, y: number, size: number, pink = false, colorOverride?: string): string {
  const large = size >= 28;
  const baseColor = colorOverride || (pink ? "#e6a0ad" : "#5b5556");
  const outerColor = large ? colorOverride || (pink ? "#fff0ee" : "#fff8ef") : baseColor;
  const innerColor = large ? colorOverride || (pink ? "#e6a0ad" : "#5b5556") : baseColor;
  const centerColor = large ? colorOverride ? "#746d6e" : pink ? "#ffe9e8" : "#fff8ef" : "#eee5e2";

  const center = size / 2;
  const innerRadius = size * 0.29;
  const centerSize = size * 0.18;

  const outerPoints = [
    `${center},1.5`, `${size - 2},${size * 0.26}`, `${size - 2},${size * 0.74}`,
    `${center},${size - 1.5}`, `2,${size * 0.74}`, `2,${size * 0.26}`
  ].join(" ");

  const innerPoints = [
    `${center},${center - innerRadius}`, `${center + innerRadius * 0.866},${center - innerRadius * 0.5}`,
    `${center + innerRadius * 0.866},${center + innerRadius * 0.5}`, `${center},${center + innerRadius}`,
    `${center - innerRadius * 0.866},${center + innerRadius * 0.5}`, `${center - innerRadius * 0.866},${center - innerRadius * 0.5}`
  ].join(" ");

  const glow = large ? 'filter="url(#starGlow)"' : "";

  return `<g transform="translate(${x} ${y})" ${glow}>
    <polygon points="${outerPoints}" fill="none" stroke="${outerColor}" stroke-width="${Math.max(1.8, size * 0.1)}" stroke-linejoin="round" />
    <polygon points="${innerPoints}" fill="${innerColor}" />
    <rect x="${center - centerSize / 2}" y="${center - centerSize / 2}" width="${centerSize}" height="${centerSize}" rx="${centerSize * 0.18}" fill="${centerColor}" />
  </g>`;
}

function robloxLogo(x: number, y: number, size: number): string {
  const tileSize = size;
  const logoSize = size * 0.58;
  const logoOffset = (tileSize - logoSize) / 2;
  const holeSize = logoSize * 0.28;
  const holeOffset = (logoSize - holeSize) / 2;

  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="${tileSize}" height="${tileSize}" rx="${tileSize * 0.28}" fill="#fffaf7" fill-opacity="0.82" filter="url(#softShadow)" />
    <g transform="translate(${logoOffset} ${logoOffset}) rotate(12 ${logoSize / 2} ${logoSize / 2})">
      <path d="M 0 0 H ${logoSize} V ${logoSize} H 0 Z M ${holeOffset} ${holeOffset} H ${holeOffset + holeSize} V ${holeOffset + holeSize} H ${holeOffset} Z" fill="#242021" fill-rule="evenodd" />
    </g>
  </g>`;
}

function copyIcon(x: number, y: number): string {
  return `<g fill="none" stroke="#615b5c" stroke-width="1.6" stroke-linejoin="round" opacity="0.78">
    <rect x="${x + 3}" y="${y}" width="12" height="15" rx="3"/>
    <path d="M ${x + 9} ${y + 4} h 6 a 3 3 0 0 1 3 3 v 9 a 3 3 0 0 1 -3 3 h -9 a 3 3 0 0 1 -3 -3 v -2"/>
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
    itemImageDataUri(input.itemUrl, purchase.assetId, purchase.itemType)
  ]);

  const totalSpentSize = valueFontSize(balance.totalSpent, 28);
  const totalCashbackSize = valueFontSize(balance.totalCashback, 28);

  const overlay = `
  <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="itemClip">
        <rect x="52" y="153" width="230" height="240" rx="14"/>
      </clipPath>
      <clipPath id="avatarClip">
        <circle cx="335" cy="210" r="30"/>
      </clipPath>

      <linearGradient id="mainPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d9cfcc" stop-opacity="0.85"/>
        <stop offset="0.5" stop-color="#c4bbba" stop-opacity="0.8"/>
        <stop offset="1" stop-color="#b8aeac" stop-opacity="0.85"/>
      </linearGradient>

      <linearGradient id="subPanel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f5edea" stop-opacity="0.95"/>
        <stop offset="0.5" stop-color="#e8e0de" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#d4cbc9" stop-opacity="0.95"/>
      </linearGradient>

      <filter id="panelShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#1a1516" flood-opacity="0.3"/>
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ffffff" flood-opacity="0.6"/>
      </filter>

      <filter id="softShadow" x="-20%" y="-30%" width="140%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#463f40" flood-opacity="0.15"/>
      </filter>

      <filter id="cashGlow" x="-50%" y="-100%" width="200%" height="300%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#fff4f1" flood-opacity="0.85"/>
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#d68394" flood-opacity="0.45"/>
      </filter>
    </defs>

    <style>
      text { font-family: 'DejaVu Sans', sans-serif; }
      .label { fill: #7c7475; font-size: 14px; font-weight: 400; }
      .value { fill: #484243; font-weight: 700; }
    </style>

    <!-- Main Container membentang penuh -->
    <rect x="30" y="130" width="1003" height="360" rx="30" fill="url(#mainPanel)" stroke="#ffffff" stroke-width="3" stroke-opacity="0.6" filter="url(#panelShadow)"/>
    <rect x="38" y="138" width="987" height="344" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.5"/>

    <!-- Left Column: Item Preview -->
    <rect x="50" y="150" width="236" height="320" rx="20" fill="url(#subPanel)" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>
    ${dynamicImage({ uri: item, x: 53, y: 153, width: 230, height: 240, clipId: "itemClip", fallback: "ITEM PREVIEW" })}
    
    <rect x="63" y="398" width="210" height="42" rx="21" fill="#6a6364" fill-opacity="0.9" stroke="#fff" stroke-opacity="0.5"/>
    <text x="168" y="424" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700" letter-spacing="1.2">NEKOBUXX SHOP</text>

    <!-- Right Column: Top Row (Buyer Info) -->
    <rect x="300" y="150" width="713" height="100" rx="20" fill="url(#subPanel)" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>
    
    <!-- User Avatar & Username -->
    <circle cx="335" cy="200" r="34" fill="none" stroke="#fff" stroke-width="3" filter="url(#softShadow)"/>
    ${dynamicImage({ uri: avatar, x: 305, y: 170, width: 60, height: 60, clipId: "avatarClip", fallback: "USER" })}
    <text x="385" y="185" class="label">Dibeli oleh</text>
    <text x="385" y="215" class="value" font-size="22">${escapeXml(truncate(purchase.robloxUsername, 17))}</text>
    ${copyIcon(610, 190)}

    <line x1="680" y1="165" x2="680" y2="235" stroke="#999192" stroke-opacity="0.3" stroke-width="2"/>

    <!-- Roblox ID Info -->
    ${robloxLogo(710, 172, 54)}
    <text x="785" y="185" class="label">Roblox ID</text>
    <text x="785" y="215" class="value" font-size="22">${purchase.robloxUserId}</text>
    ${copyIcon(960, 190)}

    <!-- Right Column: Bottom Row (Details & Summary) -->
    <!-- Item Details -->
    <rect x="300" y="265" width="455" height="205" rx="20" fill="url(#subPanel)" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>
    
    ${robuxIcon(320, 290, 28)}
    <text x="365" y="310" class="label">Nama Item</text>
    <text x="495" y="310" class="label">:</text>
    <text x="515" y="310" class="value" font-size="18">${escapeXml(truncate(purchase.assetName, 18))}</text>
    ${copyIcon(710, 292)}

    ${robuxIcon(320, 345, 28)}
    <text x="365" y="365" class="label">Item ID</text>
    <text x="495" y="365" class="label">:</text>
    <text x="515" y="365" class="value" font-size="18">${purchase.assetId}</text>
    ${copyIcon(710, 347)}

    ${robuxIcon(320, 400, 28)}
    <text x="365" y="420" class="label">Harga Item</text>
    <text x="495" y="420" class="label">:</text>
    <text x="515" y="420" class="value" font-size="18">R$ ${purchase.priceRobux.toLocaleString("id-ID")}</text>
    ${copyIcon(710, 402)}

    <!-- Summary Box -->
    <rect x="770" y="265" width="243" height="205" rx="20" fill="url(#subPanel)" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>
    
    <text x="891" y="300" class="label" text-anchor="middle">Total Belanja</text>
    ${robuxIcon(790, 312, 38)}
    <text x="840" y="342" class="value" font-size="${totalSpentSize}">R$ ${balance.totalSpent.toLocaleString("id-ID")}</text>

    <line x1="795" y1="365" x2="985" y2="365" stroke="#999192" stroke-opacity="0.3" stroke-width="2"/>

    <text x="891" y="395" class="label" fill="#c47a8b" text-anchor="middle">Total Cashback</text>
    ${robuxIcon(790, 408, 38, true)}
    <text x="840" y="438" fill="#e07089" font-size="${totalCashbackSize}" font-weight="700" filter="url(#cashGlow)">R$ ${balance.totalCashback.toLocaleString("id-ID")}</text>
  </svg>`;

  return sharp(artwork)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}