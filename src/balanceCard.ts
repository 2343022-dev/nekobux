import sharp from "sharp";
import type { RobloxLink } from "./db.js";
import type { BalanceSummary } from "./types.js";
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

function money(value: number): string {
  return value.toLocaleString("id-ID");
}

function metric(input: {
  x: number;
  y: number;
  label: string;
  value: number;
  tone: "neutral" | "rose" | "green";
}): string {
  const colors = {
    neutral: { background: "#eeeae7", border: "#c8c0bd", value: "#4d484a" },
    rose: { background: "#efe1e1", border: "#cdaeb2", value: "#9b6c76" },
    green: { background: "#dfe9e1", border: "#a9c0ae", value: "#52745c" }
  }[input.tone];
  return `
    <rect x="${input.x}" y="${input.y}" width="330" height="105" rx="24"
      fill="${colors.background}" stroke="${colors.border}" stroke-width="2"/>
    <text x="${input.x + 24}" y="${input.y + 35}" class="metricLabel">
      ${escapeXml(input.label)}
    </text>
    <text x="${input.x + 24}" y="${input.y + 80}" class="metricValue"
      fill="${colors.value}">${money(input.value)} R$</text>`;
}

export async function renderBalanceCard(input: {
  link: RobloxLink;
  balance: BalanceSummary;
  avatarUrl: string | null;
  readyAt: Date | null;
}): Promise<Buffer> {
  const { link, balance, readyAt } = input;
  const avatar = await imageDataUri(input.avatarUrl);
  const now = new Date();
  const isReady = Boolean(
    link.communityMember && readyAt && readyAt.getTime() <= now.getTime()
  );
  const status = !link.communityMember
    ? {
        title: "BELUM BERGABUNG COMMUNITY",
        detail: "Gabung Community untuk memulai masa tunggu cashback.",
        color: "#a56d73",
        background: "#f0e0e0"
      }
    : !isReady
      ? {
          title: "MASA TUNGGU BERLANGSUNG",
          detail: readyAt
            ? `Klaim terbuka ${new Intl.DateTimeFormat("id-ID", {
                timeZone: "Asia/Jakarta",
                dateStyle: "long",
                timeStyle: "short"
              }).format(readyAt)} WIB`
            : "Tanggal kelayakan sedang diperiksa.",
          color: "#8a7055",
          background: "#eee6d8"
        }
      : {
          title: balance.available > 0
            ? "SALDO SUDAH BISA DIKLAIM"
            : "SYARAT COMMUNITY TERPENUHI",
          detail: balance.available > 0
            ? "Buat ticket claim untuk mengajukan pencairan cashback."
            : "Belum ada saldo baru yang siap dicairkan.",
          color: "#52745c",
          background: "#dfe9e1"
        };

  const avatarMarkup = avatar
    ? `<image href="${avatar}" x="78" y="136" width="260" height="260"
         preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>`
    : `<circle cx="208" cy="266" r="130" fill="#817a7d"/>
       <text x="208" y="282" text-anchor="middle" class="avatarFallback">?</text>`;

  const svg = `
  <svg width="1200" height="675" viewBox="0 0 1200 675"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7f3f0"/>
        <stop offset="0.58" stop-color="#ddd7d4"/>
        <stop offset="1" stop-color="#bdb7b7"/>
      </linearGradient>
      <linearGradient id="brand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.5" stop-color="#f6ebe7"/>
        <stop offset="1" stop-color="#c2b1ab"/>
      </linearGradient>
      <linearGradient id="readyValue" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#4f7059"/>
        <stop offset="1" stop-color="#789580"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="16"
          flood-color="#514b4e" flood-opacity="0.23"/>
      </filter>
      <clipPath id="avatarClip">
        <circle cx="208" cy="266" r="130"/>
      </clipPath>
    </defs>

    <style>
      text { font-family: 'Fredoka', 'DejaVu Sans', sans-serif; font-weight: 700; }
      .brandDepth { font-size: 55px; fill: #968783; stroke: #857673; stroke-width: 3px; paint-order: stroke fill; }
      .brand { font-size: 55px; fill: url(#brand); stroke: #fffaf7; stroke-width: 2px; paint-order: stroke fill; }
      .eyebrow { font-size: 16px; letter-spacing: 2.5px; fill: #6a6467; }
      .profileLabel { font-size: 15px; letter-spacing: 1.5px; fill: #d8d0d1; }
      .displayName { font-size: 31px; fill: #fffaf8; }
      .username { font-size: 21px; fill: #e7dfe0; }
      .robloxId { font-size: 15px; fill: #cbc3c5; }
      .balanceLabel { font-size: 20px; letter-spacing: 2.2px; fill: #696366; }
      .balanceValue { font-size: 90px; letter-spacing: -3px; fill: url(#readyValue); }
      .balanceHint { font-size: 18px; fill: #746d70; }
      .metricLabel { font-size: 16px; letter-spacing: 0.6px; fill: #746d70; }
      .metricValue { font-size: 32px; }
      .statusTitle { font-size: 18px; letter-spacing: 0.5px; }
      .statusDetail { font-size: 16px; fill: #655f62; }
      .footer { font-size: 15px; fill: #686164; }
      .avatarFallback { font-size: 110px; fill: #ded7d5; }
    </style>

    <g filter="url(#shadow)">
      <rect x="20" y="20" width="1160" height="635" rx="42" fill="url(#background)"/>
      <path d="M20 20 H410 V655 H20 Z" fill="#686367"/>
      <path d="M20 565 C165 520 270 690 430 618 V655 H20 Z"
        fill="#d7afb5" fill-opacity="0.18"/>
    </g>
    <rect x="22" y="22" width="1156" height="631" rx="40"
      fill="none" stroke="#777174" stroke-opacity="0.5" stroke-width="2"/>

    <text x="455" y="82" class="brandDepth">NEKOBUX</text>
    <text x="451" y="76" class="brand">NEKOBUX</text>
    <text x="451" y="111" class="eyebrow">CASHBACK BALANCE</text>

    <text x="68" y="80" class="profileLabel">ROBLOX ACCOUNT</text>
    ${avatarMarkup}
    <circle cx="208" cy="266" r="132" fill="none"
      stroke="#e8dad8" stroke-width="4"/>
    <circle cx="208" cy="266" r="140" fill="none"
      stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
    <text x="68" y="442" class="displayName">
      ${escapeXml(truncate(link.robloxDisplayName, 20))}
    </text>
    <text x="68" y="478" class="username">
      @${escapeXml(truncate(link.robloxUsername, 22))}
    </text>
    <text x="68" y="510" class="robloxId">
      ROBLOX ID ${link.robloxUserId}
    </text>
    <rect x="68" y="544" width="285" height="2" fill="#ffffff" fill-opacity="0.16"/>
    <text x="68" y="580" class="profileLabel">PAYOUT TERKUNCI KE AKUN INI</text>

    <text x="451" y="166" class="balanceLabel">SALDO SIAP DIKLAIM</text>
    <text x="446" y="252" class="balanceValue">${money(balance.available)} R$</text>
    <text x="451" y="284" class="balanceHint">
      Cashback yang sudah memenuhi syarat dan belum masuk antrean
    </text>

    <rect x="451" y="298" width="688" height="62" rx="22"
      fill="${status.background}" stroke="${status.color}" stroke-opacity="0.45" stroke-width="2"/>
    <circle cx="486" cy="329" r="19" fill="${status.color}" fill-opacity="0.18"/>
    <path d="M477 329 l6 6 13-15" fill="none" stroke="${status.color}"
      stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="520" y="324" class="statusTitle"
      fill="${status.color}">
      ${escapeXml(status.title)}
    </text>
    <text x="520" y="348" class="statusDetail">
      ${escapeXml(truncate(status.detail, 78))}
    </text>

    ${metric({ x: 451, y: 375, label: "MENUNGGU SYARAT", value: balance.pending, tone: "rose" })}
    ${metric({ x: 809, y: 375, label: "SEDANG DIPROSES", value: balance.locked, tone: "neutral" })}
    ${metric({ x: 451, y: 495, label: "SUDAH DICAIRKAN", value: balance.paid, tone: "green" })}
    ${metric({ x: 809, y: 495, label: "TOTAL BELANJA", value: balance.totalSpent, tone: "neutral" })}

    <line x1="451" y1="615" x2="1139" y2="615"
      stroke="#6f696c" stroke-opacity="0.25"/>
    <text x="451" y="642" class="footer">
      TOTAL CASHBACK ${money(balance.totalCashback)} R$  •  NEKOBUX REWARD
    </text>
    <text x="1139" y="642" text-anchor="end" class="footer">
      SHOP MORE  •  SPEND LESS
    </text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
