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

function imageOrPlaceholder(uri: string, x: number, y: number, width: number, height: number): string {
  if (uri) {
    return `<image href="${uri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#e8ddd2"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" class="muted">Gambar belum tersedia</text>`;
}

export async function renderPurchaseCard(input: {
  purchase: PurchaseRecord;
  link: RobloxLink | null;
  balance: BalanceSummary;
  avatarUrl: string | null;
  assetUrl: string | null;
}): Promise<Buffer> {
  const { purchase, link, balance } = input;
  const [avatar, asset] = await Promise.all([
    imageDataUri(input.avatarUrl),
    imageDataUri(input.assetUrl)
  ]);
  const buyer = link?.robloxDisplayName || purchase.robloxUsername;
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(purchase.purchasedAt);

  const svg = `
  <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
    <style>
      .title { font: 700 34px Arial, sans-serif; fill: #473b37; }
      .label { font: 700 15px Arial, sans-serif; fill: #8d7770; letter-spacing: 1.2px; }
      .value { font: 700 35px Arial, sans-serif; fill: #473b37; }
      .green { fill: #43856a; }
      .pink { fill: #c66f72; }
      .muted { font: 500 18px Arial, sans-serif; fill: #967f78; }
      .small { font: 600 16px Arial, sans-serif; fill: #7f6c66; }
    </style>
    <rect width="1200" height="675" rx="36" fill="#f6efe6"/>
    <rect x="20" y="20" width="1160" height="635" rx="28" fill="none" stroke="#d8c7b9" stroke-width="3"/>
    <circle cx="55" cy="57" r="7" fill="#5d9b78"/>
    <text x="76" y="64" class="small">PEMBELIAN ITEM BARU • NEKOBUXX RESMI</text>
    <rect x="940" y="37" width="208" height="42" rx="12" fill="#f0d9c6"/>
    <text x="1044" y="64" text-anchor="middle" class="small">20% CASHBACK</text>

    <defs>
      <clipPath id="assetClip"><rect x="55" y="128" width="410" height="465" rx="24"/></clipPath>
      <clipPath id="avatarClip"><circle cx="1094" cy="142" r="46"/></clipPath>
    </defs>
    <g clip-path="url(#assetClip)">${imageOrPlaceholder(asset, 55, 128, 410, 465)}</g>
    <rect x="55" y="128" width="410" height="465" rx="24" fill="none" stroke="#bca99e" stroke-width="3"/>
    <rect x="78" y="151" width="112" height="37" rx="10" fill="#6d9a80"/>
    <text x="134" y="176" text-anchor="middle" style="font:700 16px Arial;fill:#fff">CATALOG</text>

    <text x="505" y="142" class="title">${escapeXml(truncate(purchase.assetName, 35))}</text>
    <text x="505" y="177" class="muted">Pembeli: <tspan font-weight="700">${escapeXml(truncate(buyer, 22))} (@${escapeXml(truncate(purchase.robloxUsername, 22))})</tspan></text>
    <text x="505" y="207" class="muted">Roblox ID: ${purchase.robloxUserId} • Item ID: ${purchase.assetId}</text>
    <g clip-path="url(#avatarClip)">${imageOrPlaceholder(avatar, 1048, 96, 92, 92)}</g>
    <circle cx="1094" cy="142" r="46" fill="none" stroke="#c66f72" stroke-width="4"/>

    <rect x="505" y="246" width="300" height="132" rx="20" fill="#fffaf5" stroke="#dccbc0" stroke-width="2"/>
    <text x="531" y="281" class="label">HARGA ITEM</text>
    <text x="531" y="334" class="value">${purchase.priceRobux} R$</text>
    <text x="531" y="359" class="muted">Robux resmi</text>

    <rect x="826" y="246" width="319" height="132" rx="20" fill="#f8e4da" stroke="#dfb9a7" stroke-width="2"/>
    <text x="852" y="281" class="label">CASHBACK DIDAPAT</text>
    <text x="852" y="334" class="value pink">+${purchase.cashbackRobux} R$</text>
    <text x="852" y="359" class="muted">Masuk saldo cashback</text>

    <rect x="505" y="399" width="300" height="132" rx="20" fill="#fffaf5" stroke="#dccbc0" stroke-width="2"/>
    <text x="531" y="434" class="label">TOTAL BELANJA</text>
    <text x="531" y="487" class="value">${balance.totalSpent.toLocaleString("id-ID")} R$</text>
    <text x="531" y="512" class="muted">Akumulasi pembelian</text>

    <rect x="826" y="399" width="319" height="132" rx="20" fill="#e6f3e8" stroke="#a9cfb3" stroke-width="2"/>
    <text x="852" y="434" class="label">TOTAL CASHBACK</text>
    <text x="852" y="487" class="value green">+${balance.totalCashback.toLocaleString("id-ID")} R$</text>
    <text x="852" y="512" class="muted">Akumulasi saldo</text>

    <text x="55" y="632" class="small">✓ Belanja hemat dengan cashback otomatis 20%</text>
    <text x="1145" y="632" text-anchor="end" class="muted">${escapeXml(date)} WIB</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
