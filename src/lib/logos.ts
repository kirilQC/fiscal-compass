import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { normalizeMerchant } from "./spend";

// Company logos for merchants. Each merchant is resolved once (brand → website domain → favicon image),
// stored in the merchant_logos table, and the image kept in Supabase Storage so repeat charges reuse it.

export const LOGO_BUCKET = "merchant-logos";

// Card processors prefix the real merchant name; they are never the company.
const PROCESSOR_RE = /^(tst\*|sq \*|sq\*|sp |fh\*|ysi\*|ett\*|ic\* instacart\*|wgc\*|ls |pf |signup \*|feverup\*|paypal \*)\s*/i;

/** Key logos are stored under: the merchant without processor prefix, store numbers or reference codes. */
export const logoKey = (merchant: string) => normalizeMerchant(merchant.replace(PROCESSOR_RE, "")).toLowerCase();

// Chains and services whose statement names are unambiguous. Checked before any AI lookup.
const BRANDS: [RegExp, string][] = [
  [/zelle/i, "zellepay.com"], [/cash app/i, "cash.app"], [/venmo/i, "venmo.com"],
  [/amazon|amzn/i, "amazon.com"], [/starbucks/i, "starbucks.com"], [/netflix/i, "netflix.com"], [/apple\.com|apple store|icloud/i, "apple.com"],
  [/chick-fil-a/i, "chick-fil-a.com"], [/mcdonald/i, "mcdonalds.com"], [/wm supercenter|wal-mart|walmart/i, "walmart.com"], [/kroger/i, "kroger.com"],
  [/publix/i, "publix.com"], [/wholefds|whole foods/i, "wholefoodsmarket.com"], [/aldi/i, "aldi.us"], [/instacart/i, "instacart.com"], [/target/i, "target.com"],
  [/wawa/i, "wawa.com"], [/mapco/i, "mapco.com"], [/shell/i, "shell.com"], [/exxon/i, "exxon.com"], [/7-eleven/i, "7-eleven.com"], [/circle ?k/i, "circlek.com"],
  [/racetrac/i, "racetrac.com"], [/thorntons/i, "mythorntons.com"], [/buc-ee/i, "buc-ees.com"], [/marathon/i, "marathonpetroleum.com"], [/citgo/i, "citgo.com"],
  [/uber/i, "uber.com"], [/lyft/i, "lyft.com"], [/lime\*/i, "li.me"], [/sunpass/i, "sunpass.com"], [/parkmobile/i, "parkmobile.io"],
  [/taco bell/i, "tacobell.com"], [/chipotle/i, "chipotle.com"], [/dunkin/i, "dunkindonuts.com"], [/panera/i, "panerabread.com"], [/popeyes/i, "popeyes.com"],
  [/wendy/i, "wendys.com"], [/ihop/i, "ihop.com"], [/denny/i, "dennys.com"], [/dairy queen/i, "dairyqueen.com"], [/olive garden/i, "olivegarden.com"],
  [/texas roadhouse/i, "texasroadhouse.com"], [/steak-n-shake/i, "steaknshake.com"], [/jimmy johns/i, "jimmyjohns.com"], [/5guys|five guys/i, "fiveguys.com"],
  [/blaze pizza/i, "blazepizza.com"], [/panda express/i, "pandaexpress.com"], [/daves ?hot ?chicken/i, "daveshotchicken.com"], [/chicken salad chick/i, "chickensaladchick.com"],
  [/tropical smoothie/i, "tropicalsmoothiecafe.com"], [/bj'?srestaurants/i, "bjsrestaurants.com"], [/cheesecake/i, "thecheesecakefactory.com"], [/bubba gump/i, "bubbagump.com"],
  [/jeni'?s/i, "jenis.com"], [/ben & jerry/i, "benjerry.com"], [/metro diner/i, "metrodiner.com"], [/eggspectation/i, "eggspectation.com"], [/frothy monkey/i, "frothymonkey.com"],
  [/laduree/i, "laduree.us"], [/slice\*/i, "slicelife.com"],
  [/home ?depot/i, "homedepot.com"], [/best ?buy/i, "bestbuy.com"], [/macys/i, "macys.com"], [/dollar general/i, "dollargeneral.com"], [/petco/i, "petco.com"],
  [/h&m/i, "hm.com"], [/\bups\b/i, "ups.com"], [/advance auto/i, "advanceautoparts.com"], [/autozone/i, "autozone.com"], [/o'reilly/i, "oreillyauto.com"], [/u-haul/i, "uhaul.com"],
  [/walgreens/i, "walgreens.com"], [/cvs/i, "cvs.com"], [/brilliant earth/i, "brilliantearth.com"], [/nokia/i, "nokia.com"], [/ring(\.com| llc| multi| ai)/i, "ring.com"],
  [/adobe/i, "adobe.com"], [/microsoft|msbill/i, "microsoft.com"], [/playstation/i, "playstation.com"], [/google/i, "google.com"], [/vercel/i, "vercel.com"],
  [/cursor/i, "cursor.com"], [/openai|chatgpt/i, "openai.com"], [/openrouter/i, "openrouter.ai"], [/heyreach/i, "heyreach.io"], [/lovable/i, "lovable.dev"],
  [/real-?debrid/i, "real-debrid.com"], [/sonara/i, "sonara.ai"], [/freetaxusa/i, "freetaxusa.com"], [/taskrabbit/i, "taskrabbit.com"], [/gofundme/i, "gofundme.com"],
  [/amc /i, "amctheatres.com"], [/grand ole opry/i, "opry.com"], [/salvador dali/i, "thedali.org"], [/feverup/i, "feverup.com"], [/mindbody/i, "mindbodyonline.com"],
  [/progressive/i, "progressive.com"], [/lemonade/i, "lemonade.com"], [/epremium/i, "epremiuminsurance.com"], [/united concordia/i, "unitedconcordia.com"],
  [/hgb trs trr|tricare/i, "tricare.mil"], [/tmobile|t-mobile/i, "t-mobile.com"], [/att\*|at&t/i, "att.com"], [/vzwrlss|verizon/i, "verizon.com"],
  [/breezeline/i, "breezeline.com"], [/nes electric/i, "nespower.com"], [/fpl/i, "fpl.com"], [/la fitn/i, "lafitness.com"], [/trufit/i, "trufit.com"],
  [/planet fitness|pf n /i, "planetfitness.com"], [/compassion/i, "compassion.com"], [/waychurch|way church/i, "waychurch.com"], [/progress residenti|rentprogress/i, "progressresidential.com"],
  [/hilton/i, "hilton.com"], [/wgu/i, "wgu.edu"], [/gusto/i, "gusto.com"], [/fidelity|fid bkg/i, "fidelity.com"], [/irs treas/i, "irs.gov"], [/dfas/i, "dfas.mil"],
  [/sunbit/i, "sunbit.com"],
];

export const brandDomain = (merchant: string): string | null => BRANDS.find(([re]) => re.test(merchant))?.[1] ?? null;

export const publicLogoUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;

function imageSize(bytes: Uint8Array): number | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return bytes[6] || 256;
  return null; // jpeg/webp/svg: judged by byte size instead
}

/** The site's icon at up to 256px, or null when the site has none worth showing (a 16px placeholder or an error). */
export async function fetchLogo(domain: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const sources = [
    `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const type = r.headers.get("content-type")?.split(";")[0] ?? "image/png";
      if (!type.startsWith("image/")) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      const size = imageSize(bytes);
      if (size !== null ? size >= 32 : bytes.length > 1200) return { bytes, type };
    } catch {
      // try the next source
    }
  }
  return null;
}

async function ensureBucket(admin: SupabaseClient) {
  const { data } = await admin.storage.getBucket(LOGO_BUCKET);
  if (!data) await admin.storage.createBucket(LOGO_BUCKET, { public: true, fileSizeLimit: "1MB" });
}

const extFor = (type: string) => (type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("svg") ? "svg" : "ico");

/** Uploads a domain's logo once; later merchants on the same domain reuse the file. */
export async function storeDomainLogo(admin: SupabaseClient, domain: string): Promise<string | null> {
  const { data: existing } = await admin.storage.from(LOGO_BUCKET).list("", { search: domain });
  const hit = existing?.find((f) => f.name.startsWith(`${domain}.`));
  if (hit) return hit.name;
  const logo = await fetchLogo(domain);
  if (!logo) return null;
  const path = `${domain}.${extFor(logo.type)}`;
  const { error } = await admin.storage.from(LOGO_BUCKET).upload(path, logo.bytes, { contentType: logo.type, upsert: true, cacheControl: "31536000" });
  return error ? null : path;
}

type Resolved = { brand: string | null; domain: string | null };

// For merchants the brand list does not know: the model searches the web for the business behind the statement text.
async function identifyWithAI(merchants: string[]): Promise<Record<string, Resolved> | null> {
  if (!merchants.length || !process.env.OPENAI_API_KEY) return null;
  try {
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await ai.responses.create({
      model: process.env.OPENAI_LOGO_MODEL ?? "gpt-5-mini",
      tools: [{ type: "web_search" }],
      instructions:
        'You identify the company behind US card/bank statement merchant strings so an app can show its logo. The cardholder lives in Tampa FL and travels. For each input reply in ONLY a JSON object mapping the input exactly as given to {"brand": short display name or null, "domain": the business\'s own website domain or null}. Search the web for local businesses. Prefixes like "TST*", "SQ *", "SP ", "FH*" are card processors, not the merchant. Use null for payments to individual people, cash, fees, and anything you cannot confirm; never guess a domain, and never return a directory, social or delivery site.',
      input: JSON.stringify(merchants),
    });
    const text = res.output_text?.trim() ?? "";
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, Resolved>;
  } catch {
    return null; // no credit or bad reply: leave unresolved so a later sync retries
  }
}

export interface LogoRow {
  merchant_key: string;
  brand: string | null;
  domain: string | null;
  logo_path: string | null;
  source: string;
}

/** Finds logos for any merchants not looked up yet. Safe to call on every sync; known merchants cost nothing. */
export async function resolveLogos(admin: SupabaseClient, userId: string, merchants: string[]) {
  const byKey = new Map<string, string>();
  for (const m of merchants) if (m && !byKey.has(logoKey(m))) byKey.set(logoKey(m), m);
  if (!byKey.size) return { added: 0 };
  const { data: known, error } = await admin.from("merchant_logos").select("merchant_key").eq("user_id", userId);
  if (error) return { error: error.message };
  const seen = new Set((known ?? []).map((r) => r.merchant_key));
  const todo = [...byKey].filter(([k]) => !seen.has(k));
  if (!todo.length) return { added: 0 };
  await ensureBucket(admin);

  const rows: LogoRow[] = [];
  const unknown: [string, string][] = [];
  for (const [key, merchant] of todo) {
    const domain = brandDomain(merchant);
    if (domain) rows.push({ merchant_key: key, brand: null, domain, logo_path: null, source: "dictionary" });
    else unknown.push([key, merchant]);
  }
  // Web search takes ~5s a merchant, so ask in batches of 10 and cap each run; the rest wait for the next sync.
  let unresolved = 0;
  for (let i = 0; i < unknown.length; i += 10) {
    const batch = unknown.slice(i, i + 10);
    const ai = i < 30 ? await identifyWithAI(batch.map(([, m]) => m)) : null;
    if (!ai) {
      unresolved += batch.length;
      continue;
    }
    for (const [key, merchant] of batch) {
      const hit = ai[merchant];
      rows.push({ merchant_key: key, brand: hit?.brand ?? null, domain: hit?.domain?.toLowerCase().replace(/^www\./, "") || null, logo_path: null, source: hit?.domain ? "ai" : "none" });
    }
  }
  for (const r of rows) if (r.domain) r.logo_path = await storeDomainLogo(admin, r.domain);
  if (rows.length) await admin.from("merchant_logos").upsert(rows.map((r) => ({ ...r, user_id: userId, checked_at: new Date().toISOString() })), { onConflict: "user_id,merchant_key" });
  return { added: rows.length, unresolved };
}

/** merchant key → public logo URL, for every merchant with a stored logo. */
export async function logoUrls(supabase: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from("merchant_logos").select("merchant_key,logo_path").eq("user_id", userId).not("logo_path", "is", null).limit(5000);
  return new Map((data ?? []).map((r) => [r.merchant_key as string, publicLogoUrl(r.logo_path as string)]));
}
