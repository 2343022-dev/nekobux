import { join } from "node:path";

import sharp from "sharp";

import type { RobloxLink } from "./db.js";

import type { BalanceSummary, PurchaseRecord } from "./types.js";

import { escapeXml, truncate } from "./utils.js";



const CARD_WIDTH = 1840;

const CARD_HEIGHT = 720;

const IMAGE_REQUEST_TIMEOUT_MS = 25_000;

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



function robuxIcon(

  x: number,

  y: number,

  size: number,

  pink = false,

  colorOverride?: string

): string {

  const large = size >= 28;



  const baseColor =

    colorOverride || (pink ? "#e6a0ad" : "#5b5556");



  const outerColor = large

    ? colorOverride || (pink ? "#fff0ee" : "#fff8ef")

    : baseColor;



  const innerColor = large

    ? colorOverride || (pink ? "#e6a0ad" : "#5b5556")

    : baseColor;



  const centerColor = large

    ? colorOverride

      ? "#746d6e"

      : pink

        ? "#ffe9e8"

        : "#fff8ef"

    : "#eee5e2";



  const center = size / 2;

  const innerRadius = size * 0.29;

  const centerSize = size * 0.18;



  const outerPoints = [

    `${center},1.5`,

    `${size - 2},${size * 0.26}`,

    `${size - 2},${size * 0.74}`,

    `${center},${size - 1.5}`,

    `2,${size * 0.74}`,

    `2,${size * 0.26}`

  ].join(" ");



  const innerPoints = [

    `${center},${center - innerRadius}`,

    `${center + innerRadius * 0.866},${center - innerRadius * 0.5}`,

    `${center + innerRadius * 0.866},${center + innerRadius * 0.5}`,

    `${center},${center + innerRadius}`,

    `${center - innerRadius * 0.866},${center + innerRadius * 0.5}`,

    `${center - innerRadius * 0.866},${center - innerRadius * 0.5}`

  ].join(" ");



  const glow = large

    ? 'filter="url(#starGlow)"'

    : "";



  return `<g transform="translate(${x} ${y})" ${glow}>

    <polygon

      points="${outerPoints}"

      fill="none"

      stroke="${outerColor}"

      stroke-width="${Math.max(1.8, size * 0.1)}"

      stroke-linejoin="round"

    />



    <polygon

      points="${innerPoints}"

      fill="${innerColor}"

    />



    <rect

      x="${center - centerSize / 2}"

      y="${center - centerSize / 2}"

      width="${centerSize}"

      height="${centerSize}"

      rx="${centerSize * 0.18}"

      fill="${centerColor}"

    />

  </g>`;

}

function robloxLogo(x: number, y: number, size: number): string {

  const tileSize = size;

  const logoSize = size * 0.58;

  const logoOffset = (tileSize - logoSize) / 2;

  const holeSize = logoSize * 0.28;

  const holeOffset = (logoSize - holeSize) / 2;



  return `<g transform="translate(${x} ${y})">

    <rect

      x="0"

      y="0"

      width="${tileSize}"

      height="${tileSize}"

      rx="${tileSize * 0.28}"

      fill="#fffaf7"

      fill-opacity="0.82"

      filter="url(#softShadow)"

    />



    <g transform="translate(${logoOffset} ${logoOffset}) rotate(12 ${logoSize / 2} ${logoSize / 2})">

      <path

        d="M 0 0 H ${logoSize} V ${logoSize} H 0 Z

           M ${holeOffset} ${holeOffset}

           H ${holeOffset + holeSize}

           V ${holeOffset + holeSize}

           H ${holeOffset} Z"

        fill="#242021"

        fill-rule="evenodd"

      />

    </g>

  </g>`;

}



function sparkle(

  x: number,

  y: number,

  size: number,

  opacity = 0.9

): string {

  return `<path

    d="M ${x} ${y - size}

       C ${x + size * 0.12} ${y - size * 0.2},

         ${x + size * 0.2} ${y - size * 0.12},

         ${x + size} ${y}

       C ${x + size * 0.2} ${y + size * 0.12},

         ${x + size * 0.12} ${y + size * 0.2},

         ${x} ${y + size}

       C ${x - size * 0.12} ${y + size * 0.2},

         ${x - size * 0.2} ${y + size * 0.12},

         ${x - size} ${y}

       C ${x - size * 0.2} ${y - size * 0.12},

         ${x - size * 0.12} ${y - size * 0.2},

         ${x} ${y - size} Z"

    fill="#fff8ef"

    opacity="${opacity}"

    filter="url(#starGlow)"

  />`;

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
    itemImageDataUri(input.itemUrl, purchase.assetId, purchase.itemType)
  ]);

  const spentSize = valueFontSize(balance.totalSpent, 54);
  const cashbackSize = valueFontSize(balance.totalCashback, 54);
  const username = escapeXml(truncate(purchase.robloxUsername, 20));
  const itemName = escapeXml(truncate(purchase.assetName, 25));
  const robloxId = escapeXml(String(purchase.robloxUserId));
  const itemId = escapeXml(String(purchase.assetId));
  const price = purchase.priceRobux.toLocaleString("id-ID");
  const spent = balance.totalSpent.toLocaleString("id-ID");
  const cashback = balance.totalCashback.toLocaleString("id-ID");

  const overlay = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1840" height="720" viewBox="0 0 1840 720">
    <defs>
      <linearGradient id="backgroundBase" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a79e9d"/>
        <stop offset=".48" stop-color="#b8afae"/>
        <stop offset="1" stop-color="#938b8b"/>
      </linearGradient>
      <linearGradient id="backgroundBeam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fffaf7" stop-opacity="0"/>
        <stop offset=".45" stop-color="#fffaf7" stop-opacity=".24"/>
        <stop offset=".55" stop-color="#fffaf7" stop-opacity=".24"/>
        <stop offset="1" stop-color="#fffaf7" stop-opacity="0"/>
      </linearGradient>

      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e8ddda"/>
        <stop offset=".52" stop-color="#d5c9c7"/>
        <stop offset="1" stop-color="#bdb3b2"/>
      </linearGradient>
      <linearGradient id="subPanel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f5ece8" stop-opacity=".97"/>
        <stop offset="1" stop-color="#e0d6d3" stop-opacity=".96"/>
      </linearGradient>
      <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#746d6e" stop-opacity=".84"/>
        <stop offset="1" stop-color="#5c5657" stop-opacity=".91"/>
      </linearGradient>
      <linearGradient id="pink" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ef9eae"/>
        <stop offset="1" stop-color="#d96f88"/>
      </linearGradient>
      <linearGradient id="placeholderFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c9bfbd"/>
        <stop offset="1" stop-color="#9b9090"/>
      </linearGradient>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#342c2d" flood-opacity=".28"/>
      </filter>
      <clipPath id="itemClip"><rect x="95" y="229" width="377" height="285" rx="24"/></clipPath>
      <clipPath id="avatarClip"><circle cx="589" cy="283" r="48"/></clipPath>
      <style>
        text { font-family: "DejaVu Sans", Arial, sans-serif; }
        .label { fill:#766e6f; font-size:26px; font-weight:400; }
        .value { fill:#514a4b; font-weight:700; }
        .badgeText { fill:#fffaf7; font-weight:700; letter-spacing:2px; }
        .detailLabel { fill:#746c6d; font-size:27px; }
        .detailValue { fill:#514a4b; font-size:29px; font-weight:700; }
      </style>
    </defs>

    <!-- Background opak: menutupi seluruh tulisan bawaan template agar tidak tembus/double. -->
    <rect width="1840" height="720" fill="url(#backgroundBase)"/>
    <!-- Pantulan cahaya vertikal seperti referensi, tanpa teks dari gambar template. -->
    <rect x="0" y="0" width="58" height="720" fill="url(#backgroundBeam)" opacity=".72"/>
    <rect x="205" y="0" width="78" height="720" fill="url(#backgroundBeam)" opacity=".54"/>
    <rect x="475" y="0" width="54" height="720" fill="url(#backgroundBeam)" opacity=".44"/>
    <rect x="735" y="0" width="92" height="720" fill="url(#backgroundBeam)" opacity=".42"/>
    <rect x="1030" y="0" width="62" height="720" fill="url(#backgroundBeam)" opacity=".5"/>
    <rect x="1320" y="0" width="82" height="720" fill="url(#backgroundBeam)" opacity=".46"/>
    <rect x="1635" y="0" width="72" height="720" fill="url(#backgroundBeam)" opacity=".55"/>
    <rect x="1780" y="0" width="60" height="720" fill="url(#backgroundBeam)" opacity=".5"/>

    <!-- Badge header -->
    <g filter="url(#glow)">
      <rect x="230" y="42" width="331" height="94" rx="47" fill="url(#badge)" fill-opacity=".52" stroke="#fff8f4" stroke-width="2.5"/>
      <rect x="594" y="42" width="648" height="94" rx="47" fill="url(#badge)" fill-opacity=".52" stroke="#fff8f4" stroke-width="2.5"/>
      <rect x="1274" y="42" width="331" height="94" rx="47" fill="url(#badge)" fill-opacity=".52" stroke="#fff8f4" stroke-width="2.5"/>
    </g>
    <path d="M277 68 L306 59 L328 69 L325 95 Q315 112 303 119 Q284 106 281 92 Z" fill="#fffaf7" opacity=".95"/>
    <path d="M291 87 L301 97 L316 78" fill="none" stroke="#756d6e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="354" y="100" class="badgeText" font-size="29">TRUSTED</text>
    <text x="664" y="103" class="badgeText" font-size="42" letter-spacing="8">CASHBACK</text>
    <text x="1010" y="116" class="badgeText" font-size="75">20%</text>
    <path d="M1365 59 L1342 89 L1360 89 L1348 119 L1385 78 L1366 78 Z" fill="#fffaf7"/>
    <text x="1433" y="100" class="badgeText" font-size="29">FAST</text>
    <text x="920" y="176" text-anchor="middle" fill="#fffaf7" font-size="23" letter-spacing="5">YOUR ROBLOX SHOPPING PARTNER ♡</text>

    <!-- Bingkai luar utama: isi panel terpisah dari garis tepi agar tagline tidak tertimpa garis lurus. -->
    <rect x="45" y="175" width="1745" height="493" rx="48" fill="url(#panel)" filter="url(#shadow)"/>
    <!-- Garis tepi atas dibuat terputus di tengah, mengikuti bentuk referensi asli. -->
    <path d="M92 175 H588 M1222 175 H1742 Q1790 175 1790 223 V620 Q1790 668 1742 668 H93 Q45 668 45 620 V223 Q45 175 93 175"
      fill="none" stroke="#fffaf7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
    <!-- Bingkai bagian dalam juga mengikuti sudut membulat; bagian atas tidak melewati tagline. -->
    <path d="M100 190 H575 M1235 190 H1736 Q1774 190 1774 228 V615 Q1774 652 1736 652 H99 Q61 652 61 615 V228 Q61 190 99 190"
      fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Kartu item di sisi kiri -->
    <rect x="78" y="212" width="411" height="424" rx="34" fill="url(#subPanel)" stroke="#fffaf7" stroke-opacity=".9" stroke-width="2"/>
    ${dynamicImage({ uri: item, x: 95, y: 229, width: 377, height: 285, clipId: "itemClip", fallback: "ITEM PREVIEW" })}
    <rect x="95" y="229" width="377" height="285" rx="24" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>
    <rect x="96" y="535" width="375" height="82" rx="41" fill="#70696a" stroke="#fffaf7" stroke-opacity=".6" stroke-width="2"/>
    <text x="283.5" y="587" text-anchor="middle" fill="#fffaf7" font-size="28" font-weight="700" letter-spacing="1.5">NEKOBUXX SHOP</text>

    <!-- Identitas pembeli dan Roblox ID -->
    <rect x="508" y="212" width="1247" height="143" rx="34" fill="url(#subPanel)" stroke="#fffaf7" stroke-opacity=".9" stroke-width="2"/>
    ${dynamicImage({ uri: avatar, x: 541, y: 235, width: 96, height: 96, clipId: "avatarClip", fallback: "USER" })}
    <circle cx="589" cy="283" r="49" fill="none" stroke="#fffaf7" stroke-width="3"/>
    <text x="679" y="267" class="label">Dibeli oleh</text>
    <text x="679" y="318" class="value" font-size="40">${username}</text>
    ${copyIcon(1070, 277)}
    <line x1="1175" y1="232" x2="1175" y2="335" stroke="#8d8384" stroke-opacity=".28" stroke-width="2"/>
    ${robloxLogo(1212, 231, 106)}
    <text x="1365" y="267" class="label">Roblox ID</text>
    <text x="1365" y="318" class="value" font-size="38">${robloxId}</text>
    ${copyIcon(1671, 277)}

    <!-- Detail item -->
    <rect x="508" y="372" width="815" height="264" rx="34" fill="url(#subPanel)" stroke="#fffaf7" stroke-opacity=".9" stroke-width="2"/>
    <path d="M535 459 H1295 M535 548 H1295" stroke="#8e8586" stroke-opacity=".18" stroke-width="2"/>
    ${robuxIcon(550, 397, 42)}
    <text x="622" y="429" class="detailLabel">Nama Item</text>
    <text x="817" y="429" class="detailLabel">:</text>
    <text x="858" y="429" class="detailValue">${itemName}</text>
    ${copyIcon(1247, 407)}
    ${robuxIcon(550, 485, 42)}
    <text x="622" y="517" class="detailLabel">Item ID</text>
    <text x="817" y="517" class="detailLabel">:</text>
    <text x="858" y="517" class="detailValue">${itemId}</text>
    ${copyIcon(1247, 495)}
    ${robuxIcon(550, 574, 42)}
    <text x="622" y="606" class="detailLabel">Harga Item</text>
    <text x="817" y="606" class="detailLabel">:</text>
    <text x="858" y="606" class="detailValue">R$ ${price}</text>
    ${copyIcon(1247, 584)}

    <!-- Ringkasan total belanja dan cashback -->
    <rect x="1339" y="372" width="416" height="264" rx="34" fill="url(#subPanel)" stroke="#fffaf7" stroke-opacity=".9" stroke-width="2"/>
    <text x="1468" y="418" class="label">Total Belanja</text>
    ${robuxIcon(1378, 431, 57)}
    <text x="1468" y="486" class="value" font-size="${spentSize}">R$ ${spent}</text>
    <line x1="1368" y1="510" x2="1727" y2="510" stroke="#81797a" stroke-opacity=".3" stroke-width="2"/>
    <text x="1468" y="552" class="label">Total Cashback</text>
    ${robuxIcon(1378, 565, 57, true)}
    <text x="1468" y="620" fill="url(#pink)" font-size="${cashbackSize}" font-weight="700">R$ ${cashback}</text>
  </svg>`;

  return sharp(artwork)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
