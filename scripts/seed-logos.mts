// One-off: stores logos for every existing merchant. Chains come from the brand list in src/lib/logos.ts;
// local businesses from a web-research pass (2026-09-28). New merchants are resolved during sync.
import { createClient } from "@supabase/supabase-js";
import { brandDomain, logoKey, storeDomainLogo, LOGO_BUCKET } from "../src/lib/logos.ts";

const LOCAL: [RegExp, string][] = [
  [/giancarlos/i, "giancarlostpa.com"], [/blind tiger/i, "blindtigercoffeeroasters.com"], [/trip s diner/i, "tripsdiner.com"], [/qamaria/i, "qamariacoffee.com"],
  [/puffy muffin/i, "puffymuffin.com"], [/slim & husky/i, "slimandhuskys.com"], [/princes/i, "princeshotchicken.com"], [/provisions coffee/i, "provisionscoffeefl.com"],
  [/zio matto/i, "ziomatto.com"], [/pepper pott/i, "thepepperpott.com"], [/lolas european/i, "lolaseuropeancafe.com"], [/tokyo hibachi/i, "tokyonashville.com"],
  [/silver fox coffee/i, "silverfoxcoffee.co"], [/pharmacy burger/i, "thepharmacyburger.com"], [/social roost/i, "eatatsocialroost.com"], [/melt n dip/i, "meltndip.com"],
  [/pura vida/i, "puravidamiami.com"], [/azucar ice cream/i, "azucaricecream.com"], [/peach house/i, "peachhouselakeland.com"], [/foxtail coffee/i, "foxtailcoffee.com"],
  [/kobe japanese/i, "kobesteakhouse.com"], [/chill bros/i, "chillbros.com"], [/santoros/i, "santorospizzeria.com"], [/socotra/i, "socotracoffeeusa.com"],
  [/drusie|hermitage/i, "thehermitagehotel.com"], [/fat mo'?s/i, "fatmos.org"], [/bean bar/i, "beanbarco.com"], [/sesame hyde park/i, "sesamehydepark.com"],
  [/talkin tacos/i, "talkintacos.net"], [/xtra diner/i, "xtradinergyrogrill.com"], [/yogurtology/i, "yogurtology.com"], [/skyviews/i, "skyviewsmiami.com"],
  [/tampa city boxing|tampacity/i, "tampacityboxing.com"], [/uptown cheapskate/i, "uptowncheapskate.com"], [/boot factory/i, "bootfactoryoutlet.com"], [/labelswap/i, "labelswap.com"],
  [/animal house/i, "nashvilleanimalhouse.com"], [/montagne parfums/i, "montagneparfums.com"], [/armaf/i, "armaf.com"], [/hewouldlovefirst/i, "hewouldlovefirst.com"],
  [/jesus loves/i, "jesuslovesyou.company"], [/petting farm/i, "bfpettingfarm.com"], [/vous conference/i, "vouscon.com"], [/color me mine/i, "colormemine.com"],
  [/heartwaychurch/i, "heartwaychurch.com"], [/radiant church/i, "weareradiant.com"], [/wiregrass direct/i, "wiregrassdirectprimarycare.com"],
  [/southernaire/i, "southernairemarket.com"], [/kings crossing/i, "kingscrossingbarn.com"], [/doverglen/i, "schattenproperties.com"], [/pintes/i, "pintesinvestmentgroup.com"],
  [/lazgo/i, "lazparking.com"], [/get covered/i, "getcoveredinsurance.com"], [/coh prking/i, "hollywoodfl.org"], [/mpa parking|miami parking/i, "miamiparking.com"],
  [/ventra/i, "ventrachicago.com"], [/sunshine car wash/i, "sunshinewashes.com"], [/cheekwood/i, "cheekwood.org"], [/parthenon/i, "nashvilleparthenon.com"],
  [/savannah bee/i, "savannahbee.com"], [/turn their heads/i, "turntheirheads.com"], [/acbuy/i, "acbuy.com"], [/eggspectation/i, "eggspectation.com"],
];

const DRY = process.env.DRY === "1";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: txns } = await admin.from("transactions").select("user_id,merchant,is_transfer").limit(20000);
const byKey = new Map<string, { merchant: string; userId: string }>();
for (const t of txns ?? []) if (!t.is_transfer && !byKey.has(logoKey(t.merchant))) byKey.set(logoKey(t.merchant), { merchant: t.merchant, userId: t.user_id });

if (!DRY) {
  const { data } = await admin.storage.getBucket(LOGO_BUCKET);
  if (!data) await admin.storage.createBucket(LOGO_BUCKET, { public: true, fileSizeLimit: "1MB" });
}
const rows: Record<string, unknown>[] = [];
const noLogo: string[] = [];
for (const [key, { merchant, userId }] of byKey) {
  const local = LOCAL.find(([re]) => re.test(merchant))?.[1] ?? null;
  const domain = local ?? brandDomain(merchant);
  const path = domain && !DRY ? await storeDomainLogo(admin, domain) : null;
  if (!domain || (!DRY && !path)) noLogo.push(`${merchant}${domain ? ` (${domain}: no usable icon)` : ""}`);
  rows.push({ user_id: userId, merchant_key: key, brand: null, domain, logo_path: path, source: local ? "research" : domain ? "dictionary" : "none", checked_at: new Date().toISOString() });
}
if (!DRY) {
  const { error } = await admin.from("merchant_logos").upsert(rows, { onConflict: "user_id,merchant_key" });
  if (error) throw new Error(error.message);
}
console.log(`${rows.length} merchants · ${rows.length - noLogo.length} with logos · ${noLogo.length} without`);
console.log(noLogo.sort().join("\n"));
