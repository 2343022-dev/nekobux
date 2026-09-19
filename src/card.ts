import sharp from "sharp";
import type { RobloxLink } from "./db.js";
import type { BalanceSummary, PurchaseRecord } from "./types.js";
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

function imageOrPlaceholder(
  uri: string,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string
): string {
  if (uri) {
    return `<image href="${uri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  }

  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#d8d2cf"/>
    <path d="M ${x + width / 2 - 34} ${y + height / 2 + 9} l 21 -25 18 18 18 -14 30 39 h -87 z" fill="#aaa3a3"/>
    <circle cx="${x + width / 2 + 37}" cy="${y + height / 2 - 35}" r="12" fill="#bcb4b3"/>
    <text x="${x + width / 2}" y="${y + height / 2 + 68}" text-anchor="middle" class="placeholder">${escapeXml(label)}</text>`;
}

function statRow(input: {
  y: number;
  label: string;
  value: string;
  accent?: boolean;
}): string {
  return `
    <rect x="495" y="${input.y}" width="630" height="52" rx="16" class="${input.accent ? "statRowAccent" : "statRow"}"/>
    <text x="519" y="${input.y + 33}" class="statLabel">${escapeXml(input.label)}</text>
    <text x="1101" y="${input.y + 36}" text-anchor="end" class="${input.accent ? "statValue goldText" : "statValue"}">${escapeXml(input.value)}</text>`;
}

export async function renderPurchaseCard(input: {
  purchase: PurchaseRecord;
  link: RobloxLink | null;
  balance: BalanceSummary;
  avatarUrl: string | null;
  itemUrl: string | null;
}): Promise<Buffer> {
  const { purchase, link, balance } = input;

  const [avatar, item] = await Promise.all([
    imageDataUri(input.avatarUrl),
    imageDataUri(input.itemUrl)
  ]);

  const buyer = link?.robloxDisplayName || purchase.robloxUsername;
  const itemKind = purchase.itemType === "bundle" ? "BUNDLE" : "CATALOG";
  const itemIdLabel = purchase.itemType === "bundle" ? "BUNDLE ID" : "ITEM ID";

  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(purchase.purchasedAt);

  const svg = `
  <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#867b78"/>
        <stop offset="0.55" stop-color="#6a6766"/>
        <stop offset="1" stop-color="#453e3b"/>
      </linearGradient>

      <linearGradient id="goldMetal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f5e3c9"/>
        <stop offset="0.48" stop-color="#e0c8b2"/>
        <stop offset="1" stop-color="#cfa46b"/>
      </linearGradient>

      <linearGradient id="pearl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffaf8"/>
        <stop offset="1" stop-color="#d9d2d2"/>
      </linearGradient>

      <radialGradient id="pearlGlow">
        <stop offset="0" stop-color="#efe1d9" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#efe1d9" stop-opacity="0"/>
      </radialGradient>

      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow
          dx="0"
          dy="12"
          stdDeviation="15"
          flood-color="#514b4e"
          flood-opacity="0.22"
        />
      </filter>

      <mask id="ticketMask">
        <rect x="20" y="20" width="1160" height="635" rx="42" fill="white"/>
        <circle cx="20" cy="338" r="25" fill="black"/>
        <circle cx="1180" cy="338" r="25" fill="black"/>
      </mask>

      <clipPath id="assetClip">
        <path d="M70 112 Q70 82 100 82 H378 Q414 82 414 118 V430 L358 492 H100 Q70 492 70 462 Z"/>
      </clipPath>

      <clipPath id="avatarClip">
        <circle cx="369" cy="548" r="42"/>
      </clipPath>
    </defs>

    <style>
      text {
        font-family: 'DejaVu Sans', sans-serif;
      }

      .eyebrow {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 3px;
        fill: #efe1d9;
      }

      .brand {
        font-size: 42px;
        font-weight: 800;
        letter-spacing: 1.5px;
        fill: #fff9f5;
      }

      .brandAccent {
        fill: #e0c8b2;
      }

      .small {
        font-size: 15px;
        font-weight: 600;
        fill: #efe1d9;
      }

      .micro {
        font-size: 13px;
        font-weight: 600;
        fill: #d7ceca;
        letter-spacing: 0.5px;
      }

      .leftSmall {
        font-size: 15px;
        font-weight: 600;
        fill: #eee8e6;
      }

      .leftMicro {
        font-size: 13px;
        font-weight: 600;
        fill: #d9d1d2;
        letter-spacing: 0.5px;
      }

      .buyer {
        font-size: 21px;
        font-weight: 800;
        fill: #fffaf8;
      }

      .cashLabel {
        font-size: 17px;
        font-weight: 800;
        letter-spacing: 4px;
        fill: #efe1d9;
      }

      .cashValue {
        font-size: 91px;
        font-weight: 800;
        fill: url(#goldMetal);
        letter-spacing: -4px;
      }

      .itemName {
        font-size: 29px;
        font-weight: 800;
        fill: #fff9f5;
      }

      .itemMeta {
        font-size: 16px;
        font-weight: 600;
        fill: #d7ceca;
      }

      .statRow {
        fill: #efe1d9;
        fill-opacity: 0.96;
        stroke: #ffffff;
        stroke-opacity: 0.28;
      }

      .statRowAccent {
        fill: #e0c8b2;
        fill-opacity: 0.98;
        stroke: #f7eee8;
        stroke-opacity: 0.5;
      }

      .statLabel {
        font-size: 17px;
        font-weight: 800;
        letter-spacing: 1.5px;
        fill: #6a6766;
      }

      .statValue {
        font-size: 31px;
        font-weight: 800;
        fill: #312d2c;
      }

      .goldText {
        fill: #805728;
      }

      .placeholder {
        font-size: 16px;
        font-weight: 700;
        fill: #776f72;
      }
    </style>

    <g mask="url(#ticketMask)" filter="url(#shadow)">
      <rect
        x="20"
        y="20"
        width="1160"
        height="635"
        rx="42"
        fill="url(#background)"
      />

      <circle
        cx="1055"
        cy="112"
        r="260"
        fill="url(#pearlGlow)"
      />

      <circle
        cx="615"
        cy="650"
        r="260"
        fill="url(#pearlGlow)"
        opacity="0.42"
      />

      <path
        d="M20 20 H460 V655 H20 Z"
        fill="#1d1b1b"
        opacity="0.9"
      />

      <path
        d="M933 20 H1180 V188 L1095 151 Z"
        fill="#efe1d9"
        opacity="0.08"
      />

      <path
        d="M20 570 C180 528 300 694 484 625 L484 675 H20 Z"
        fill="#cfa46b"
        opacity="0.08"
      />
    </g>

    <rect
      x="22"
      y="22"
      width="1156"
      height="631"
      rx="40"
      fill="none"
      stroke="#efe1d9"
      stroke-opacity="0.52"
      stroke-width="2"
    />

    <path
      d="M1088 75 l7 20 20 7-20 7-7 20-7-20-20-7 20-7z"
      fill="#efe1d9"
      opacity="0.92"
    />

    <path
      d="M1027 162 c-15-18-45-3-34 21 9 20 34 31 34 31s25-11 34-31c11-24-19-39-34-21z"
      fill="none"
      stroke="#efe1d9"
      stroke-width="4"
      opacity="0.38"
    />

    <circle cx="1115" cy="205" r="3" fill="#efe1d9"/>
    <circle cx="1132" cy="188" r="5" fill="#c6697b"/>

    <rect
      x="70"
      y="48"
      width="170"
      height="33"
      rx="16"
      fill="#ffffff"
      fill-opacity="0.13"
      stroke="#eee4e2"
      stroke-opacity="0.5"
    />

    <circle cx="90" cy="64.5" r="4" fill="#c6697b"/>

    <text x="104" y="70" class="leftMicro">
      NEW PURCHASE
    </text>

    <g clip-path="url(#assetClip)">
      ${imageOrPlaceholder(item, 70, 82, 344, 410, "Item belum tersedia")}
    </g>

    <path
      d="M70 112 Q70 82 100 82 H378 Q414 82 414 118 V430 L358 492 H100 Q70 492 70 462 Z"
      fill="none"
      stroke="url(#pearl)"
      stroke-opacity="0.75"
      stroke-width="3"
    />

    <path
      d="M358 492 L414 430 H358 Z"
      fill="#cfa46b"
      fill-opacity="0.22"
      stroke="#efe1d9"
      stroke-opacity="0.7"
    />

    <rect
      x="87"
      y="102"
      width="110"
      height="34"
      rx="17"
      fill="#5c575a"
      fill-opacity="0.88"
      stroke="#fff8f5"
      stroke-opacity="0.35"
    />

    <text
      x="142"
      y="125"
      text-anchor="middle"
      class="leftMicro"
    >
      ${itemKind}
    </text>

    <g clip-path="url(#avatarClip)">
      ${imageOrPlaceholder(avatar, 327, 506, 84, 84, "")}
    </g>

    <circle
      cx="369"
      cy="548"
      r="43"
      fill="none"
      stroke="#cfa46b"
      stroke-width="3"
    />

    <circle
      cx="369"
      cy="548"
      r="48"
      fill="none"
      stroke="#fff8f5"
      stroke-opacity="0.18"
    />

    <text x="70" y="534" class="leftMicro">
      DIBELI OLEH
    </text>

    <text x="70" y="566" class="buyer">
      ${escapeXml(truncate(buyer, 20))}
    </text>

    <text x="70" y="591" class="leftSmall">
      @${escapeXml(truncate(purchase.robloxUsername, 22))}
    </text>

    <text x="70" y="620" class="leftMicro">
      ROBLOX ID ${purchase.robloxUserId}
    </text>

    <line
      x1="455"
      y1="63"
      x2="455"
      y2="612"
      stroke="#efe1d9"
      stroke-opacity="0.3"
      stroke-width="2"
      stroke-dasharray="4 13"
    />

    <circle cx="455" cy="43" r="5" fill="#cfa46b"/>
    <circle cx="455" cy="632" r="5" fill="#cfa46b"/>

    <text x="495" y="81" class="brand">
      NEKO<tspan class="brandAccent">BUX</tspan>
    </text>

    <text x="495" y="109" class="eyebrow">
      CASHBACK SHOP 20%
    </text>

    <rect
      x="984"
      y="58"
      width="140"
      height="42"
      rx="21"
      fill="#efe1d9"
      fill-opacity="0.12"
      stroke="#efe1d9"
      stroke-opacity="0.46"
    />

    <text
      x="1054"
      y="84"
      text-anchor="middle"
      class="small"
    >
      TRUSTED
    </text>

    <text x="495" y="174" class="cashLabel">
      CASHBACK DITERIMA
    </text>

    <text x="490" y="269" class="cashValue">
      +${purchase.cashbackRobux.toLocaleString("id-ID")} R$
    </text>

    <path
      d="M995 187 q28-38 57 0 q29-38 57 0 c0 42-57 73-57 73s-57-31-57-73z"
      fill="none"
      stroke="#efe1d9"
      stroke-opacity="0.23"
      stroke-width="7"
    />

    <line
      x1="495"
      y1="300"
      x2="1125"
      y2="300"
      stroke="#efe1d9"
      stroke-opacity="0.28"
    />

    <text x="495" y="344" class="itemName">
      ${escapeXml(truncate(purchase.assetName, 38))}
    </text>

    <text x="495" y="377" class="itemMeta">
      ${itemIdLabel} ${purchase.assetId}  •  HARGA ${purchase.priceRobux.toLocaleString("id-ID")} ROBUX
    </text>

    <rect
      x="495"
      y="402"
      width="630"
      height="3"
      rx="1.5"
      fill="#efe1d9"
      fill-opacity="0.2"
    />

    <rect
      x="495"
      y="402"
      width="${Math.max(70, Math.min(630, purchase.cashbackRobux * 9))}"
      height="3"
      rx="1.5"
      fill="url(#goldMetal)"
    />

    ${statRow({
      y: 425,
      label: "HARGA ITEM",
      value: `${purchase.priceRobux.toLocaleString("id-ID")} R$`
    })}

    ${statRow({
      y: 487,
      label: "TOTAL BELANJA",
      value: `${balance.totalSpent.toLocaleString("id-ID")} R$`
    })}

    ${statRow({
      y: 549,
      label: "SALDO CASHBACK",
      value: `+${balance.totalCashback.toLocaleString("id-ID")} R$`,
      accent: true
    })}

    <text x="495" y="636" class="small">
      SHOP MORE  •  SPEND LESS
    </text>

    <text
      x="1125"
      y="636"
      text-anchor="end"
      class="micro"
    >
      NEKOBUX OFFICIAL  •  ${escapeXml(date)} WIB
    </text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}