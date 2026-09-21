import { join } from "node:path";
import sharp from "sharp";
import type { RobloxLink } from "./db.js";
import type { BalanceSummary, PurchaseRecord } from "./types.js";
import { escapeXml, truncate } from "./utils.js";

const CARD_WIDTH = 1063;
const CARD_HEIGHT = 522;
const TEMPLATE_PATH = join(
  process.cwd(),
  "assets",
  "purchase-card-template.png"
);

let cleanedTemplatePromise: Promise<Buffer> | null = null;

async function imageDataUri(url: string | null): Promise<string> {
  if (!url) return "";

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) return "";

    const contentType =
      response.headers.get("content-type") || "image/png";

    const data = Buffer.from(
      await response.arrayBuffer()
    ).toString("base64");

    return `data:${contentType};base64,${data}`;
  } catch {
    return "";
  }
}

function loadCleanedTemplate(): Promise<Buffer> {
  if (cleanedTemplatePromise) return cleanedTemplatePromise;

  cleanedTemplatePromise = (async () => {
    const base = await sharp(TEMPLATE_PATH)
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
      .png()
      .toBuffer();

    const blurred = await sharp(base)
      .blur(13)
      .png()
      .toBuffer();

    const cleanupMask = Buffer.from(`
      <svg
        width="${CARD_WIDTH}"
        height="${CARD_HEIGHT}"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="100%" height="100%" fill="black"/>

        <!-- Username pembeli -->
        <rect x="594" y="264" width="176" height="29" rx="8" fill="white"/>

        <!-- Roblox User ID -->
        <rect x="876" y="266" width="126" height="27" rx="7" fill="white"/>

        <!-- Nama item -->
        <rect x="663" y="326" width="143" height="27" rx="7" fill="white"/>

        <!-- Item ID -->
        <rect x="663" y="364" width="143" height="27" rx="7" fill="white"/>

        <!-- Harga item -->
        <rect x="662" y="399" width="105" height="29" rx="7" fill="white"/>

        <!-- Total belanja -->
        <rect x="881" y="343" width="125" height="34" rx="8" fill="white"/>

        <!-- Total cashback -->
        <rect x="881" y="402" width="125" height="35" rx="8" fill="white"/>

        <!-- Nilai cashback bagian bawah -->
        <rect x="818" y="464" width="178" height="46" rx="18" fill="white"/>
      </svg>
    `);

    const blurredValues = await sharp(blurred)
      .composite([
        {
          input: cleanupMask,
          blend: "dest-in"
        }
      ])
      .png()
      .toBuffer();

    return sharp(base)
      .composite([
        {
          input: blurredValues,
          top: 0,
          left: 0
        }
      ])
      .png()
      .toBuffer();
  })();

  return cleanedTemplatePromise;
}

function dynamicImage(input: {
  uri: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clipId: string;
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

  return `<rect
    x="${input.x}"
    y="${input.y}"
    width="${input.width}"
    height="${input.height}"
    rx="14"
    fill="#746f70"
    fill-opacity="0.96"
    clip-path="url(#${input.clipId})"
  />`;
}

function valueFontSize(value: number, normal: number): number {
  const length = value.toLocaleString("id-ID").length;

  if (length >= 10) return normal - 6;
  if (length >= 8) return normal - 3;
  return normal;
}

export async function renderPurchaseCard(input: {
  purchase: PurchaseRecord;
  link: RobloxLink | null;
  balance: BalanceSummary;
  avatarUrl: string | null;
  itemUrl: string | null;
}): Promise<Buffer> {
  const { purchase, balance } = input;

  const [template, avatar, item] = await Promise.all([
    loadCleanedTemplate(),
    imageDataUri(input.avatarUrl),
    imageDataUri(input.itemUrl)
  ]);

  const totalSpentSize = valueFontSize(balance.totalSpent, 25);
  const totalCashbackSize = valueFontSize(
    balance.totalCashback,
    25
  );
  const bottomCashbackSize = valueFontSize(
    balance.totalCashback,
    34
  );

  const overlay = `
  <svg
    width="${CARD_WIDTH}"
    height="${CARD_HEIGHT}"
    viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath id="itemClip">
        <rect x="379" y="264" width="124" height="109" rx="14"/>
      </clipPath>

      <clipPath id="avatarClip">
        <circle cx="559" cy="270" r="24"/>
      </clipPath>

      <linearGradient id="cashText" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff7f4"/>
        <stop offset="0.48" stop-color="#f1c7ce"/>
        <stop offset="1" stop-color="#d996a4"/>
      </linearGradient>

      <filter id="cashGlow" x="-40%" y="-80%" width="180%" height="260%">
        <feDropShadow
          dx="0"
          dy="0"
          stdDeviation="4"
          flood-color="#fff4f1"
          flood-opacity="0.55"
        />
      </filter>
    </defs>

    <style>
      text {
        font-family: 'Fredoka', 'DejaVu Sans', sans-serif;
        font-weight: 700;
      }

      .darkValue {
        fill: #504a4b;
      }

      .pinkValue {
        fill: #d78392;
      }
    </style>

    <!-- Gambar item: posisi persis mengikuti template. -->
    ${dynamicImage({
      uri: item,
      x: 379,
      y: 264,
      width: 124,
      height: 109,
      clipId: "itemClip"
    })}

    <rect
      x="379"
      y="264"
      width="124"
      height="109"
      rx="14"
      fill="none"
      stroke="#fff8f4"
      stroke-opacity="0.68"
      stroke-width="2"
    />

    <!-- Avatar pembeli: posisi persis mengikuti template. -->
    ${dynamicImage({
      uri: avatar,
      x: 535,
      y: 246,
      width: 48,
      height: 48,
      clipId: "avatarClip"
    })}

    <circle
      cx="559"
      cy="270"
      r="25"
      fill="none"
      stroke="#fff8f4"
      stroke-opacity="0.8"
      stroke-width="2"
    />

    <!-- Nilai dinamis. Semua label dan layout tetap berasal dari template. -->
    <text
      x="600"
      y="285"
      class="darkValue"
      font-size="20"
    >
      ${escapeXml(truncate(purchase.robloxUsername, 16))}
    </text>

    <text
      x="881"
      y="285"
      class="darkValue"
      font-size="16"
    >
      ${purchase.robloxUserId}
    </text>

    <text
      x="669"
      y="346"
      class="darkValue"
      font-size="16"
    >
      ${escapeXml(truncate(purchase.assetName, 15))}
    </text>

    <text
      x="669"
      y="384"
      class="darkValue"
      font-size="16"
    >
      ${purchase.assetId}
    </text>

    <text
      x="669"
      y="419"
      class="darkValue"
      font-size="17"
    >
      R$ ${purchase.priceRobux.toLocaleString("id-ID")}
    </text>

    <text
      x="886"
      y="369"
      class="darkValue"
      font-size="${totalSpentSize}"
    >
      R$ ${balance.totalSpent.toLocaleString("id-ID")}
    </text>

    <text
      x="886"
      y="429"
      class="pinkValue"
      font-size="${totalCashbackSize}"
    >
      R$ ${balance.totalCashback.toLocaleString("id-ID")}
    </text>

    <text
      x="907"
      y="501"
      text-anchor="middle"
      fill="url(#cashText)"
      font-size="${bottomCashbackSize}"
      stroke="#fff8f5"
      stroke-opacity="0.24"
      stroke-width="1"
      paint-order="stroke fill"
      filter="url(#cashGlow)"
    >
      R$ ${balance.totalCashback.toLocaleString("id-ID")}
    </text>
  </svg>`;

  return sharp(template)
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
