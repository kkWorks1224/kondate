import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { INGREDIENTS } from "../src/data/ingredients";
import { CUT_RATE, METHODS } from "../src/services/ai/recipeGenerator";
type User = { id: string; email: string; name: string; picture: string };

type Env = {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  AI_MODEL: string;
  VISION_MODEL: string;
  DEV_LOGIN?: string;
  AI_LIMITER?: RateLimit;
  SYNC_LIMITER?: RateLimit;
};
type Vars = { user: User };
type C = import("hono").Context<{ Bindings: Env; Variables: Vars }>;

const SESSION_DAYS = 60;
const AI_DAILY_LIMIT = 100;
const MAX_BODY = 3 * 1024 * 1024;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const baseHeaders = secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  referrerPolicy: "strict-origin-when-cross-origin",
  xFrameOptions: "DENY",
});
app.use("*", (c, next) => (c.req.path === "/auth/callback" ? next() : baseHeaders(c, next)));

// 状態を変えるリクエストは自オリジンからのみ（SameSite Cookie に加えた CSRF 対策）
app.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const self = new URL(c.req.url).origin;
  const origin = c.req.header("origin");
  const site = c.req.header("sec-fetch-site");
  if (origin ? origin !== self : site && site !== "same-origin") return c.json({ error: "forbidden" }, 403);
  if (Number(c.req.header("content-length") ?? 0) > MAX_BODY) return c.json({ error: "too_large" }, 413);
  return next();
});

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: "bad_request" }, 400);
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

// ---------- helpers ----------
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (ch) => ch.charCodeAt(0));
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const isSecure = (url: string) => new URL(url).protocol === "https:";

async function createSession(c: C, user: User) {
  const db = c.env.DB;
  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`,
    )
    .bind(user.id, user.email, user.name, user.picture, Date.now())
    .run();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(Date.now()).run();
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)")
    .bind(await sha256(token), user.id, Date.now() + SESSION_DAYS * 864e5)
    .run();
  setCookie(c, "sid", token, { httpOnly: true, secure: isSecure(c.req.url), sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

async function currentUser(c: C): Promise<User | null> {
  const token = getCookie(c, "sid");
  if (!token) return null;
  return (
    (await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > ?2`,
    )
      .bind(await sha256(token), Date.now())
      .first<User>()) ?? null
  );
}

// ---------- auth：Google OpenID Connect（ID トークンを Google の公開鍵で検証。クライアントシークレット不要） ----------
type Jwk = JsonWebKey & { kid: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;
async function googleKeys(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const { keys } = (await r.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys };
  return keys;
}

async function verifyIdToken(token: string, clientId: string, nonce: string) {
  try {
    if (token.length > 8192) return null;
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    if (header.alg !== "RS256") return null;
    let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    const validIss = ["https://accounts.google.com", "accounts.google.com"].includes(claims.iss);
    if (!validIss || claims.aud !== clientId || claims.exp * 1000 < Date.now() || claims.nonce !== nonce) return null;
    return claims as { sub: string; email?: string; name?: string; picture?: string };
  } catch {
    return null;
  }
}

app.get("/auth/login", (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.text("Google OAuth is not configured", 503);
  const state = randomToken(16);
  const nonce = randomToken(16);
  setCookie(c, "oauth", `${state}.${nonce}`, { httpOnly: true, secure: isSecure(c.req.url), sameSite: "Lax", path: "/auth", maxAge: 600 });
  const q = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL("/auth/callback", c.req.url).toString(),
    response_type: "id_token",
    response_mode: "fragment",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
});

// ID トークンは URL フラグメントで返る（サーバに届かない）ので、小さなページで受け取り /auth/complete へ送る
app.get("/auth/callback", (c) =>
  c.html(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ログイン中</title><script src="/callback.js"></script>',
    200,
    {
      "content-security-policy": "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  ),
);

app.post("/auth/complete", async (c) => {
  const [state, nonce] = (getCookie(c, "oauth") ?? "").split(".");
  deleteCookie(c, "oauth", { path: "/auth" });
  const body = await c.req.json<{ id_token?: string; state?: string }>();
  if (!state || !nonce || body.state !== state || typeof body.id_token !== "string") return c.json({ error: "bad_state" }, 400);
  const claims = await verifyIdToken(body.id_token, c.env.GOOGLE_CLIENT_ID, nonce);
  if (!claims) return c.json({ error: "invalid_token" }, 400);
  await createSession(c, { id: `g:${claims.sub}`, email: claims.email ?? "", name: claims.name ?? "", picture: claims.picture ?? "" });
  return c.json({ ok: true });
});

// ローカル開発専用（.dev.vars の DEV_LOGIN=1 かつ localhost のときだけ有効）
app.get("/auth/dev", async (c) => {
  const host = new URL(c.req.url).hostname;
  if (c.env.DEV_LOGIN !== "1" || !["localhost", "127.0.0.1"].includes(host)) return c.notFound();
  await createSession(c, { id: "dev:tester", email: "tester@example.test", name: "テスト ユーザー", picture: "" });
  return c.redirect("/");
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, "sid");
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(await sha256(token)).run();
  deleteCookie(c, "sid", { path: "/" });
  return c.json({ ok: true });
});

// ---------- api ----------
app.get("/api/me", async (c) => {
  const user = await currentUser(c);
  return c.json({ user }, 200, { "cache-control": "no-store" });
});

app.use("/api/*", async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
});

// アプリの状態（1ユーザー1文書）。rev で別端末の古い状態による上書きを防ぐ
app.get("/api/state", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT data, rev, updated_at, device FROM app_state WHERE user_id = ?1")
    .bind(user.id)
    .first<{ data: string; rev: number; updated_at: number; device: string }>();
  if (!row) return c.json({ rev: 0, updatedAt: 0, data: null }, 200, { "cache-control": "no-store" });
  return c.json({ rev: row.rev, updatedAt: row.updated_at, device: row.device, data: JSON.parse(row.data) }, 200, { "cache-control": "no-store" });
});

app.put("/api/state", async (c) => {
  const user = c.get("user");
  if (c.env.SYNC_LIMITER && !(await c.env.SYNC_LIMITER.limit({ key: user.id })).success) return c.json({ error: "rate_limited" }, 429);
  const body = await c.req.json<{ baseRev?: number; data?: unknown; device?: string; force?: boolean }>();
  const data = body.data as Record<string, unknown> | undefined;
  // 最低限の形の確認（中身の整合はクライアントのストアが担う）
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.schema !== "number" || typeof data.recipes !== "object") {
    return c.json({ error: "bad_request" }, 400);
  }
  const text = JSON.stringify(data);
  if (text.length > 2_000_000) return c.json({ error: "too_large" }, 413);
  const baseRev = typeof body.baseRev === "number" ? body.baseRev : -1;
  const device = typeof body.device === "string" ? body.device.slice(0, 40) : "";
  const now = Date.now();
  const db = c.env.DB;
  // 現在の rev が baseRev と一致するときだけ書き込む（force は端末側で明示的に上書きを選んだとき）
  const res = body.force
    ? await db
        .prepare(
          `INSERT INTO app_state (user_id, data, rev, updated_at, device) VALUES (?1, ?2, 1, ?3, ?4)
           ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, rev = app_state.rev + 1, updated_at = excluded.updated_at, device = excluded.device
           RETURNING rev`,
        )
        .bind(user.id, text, now, device)
        .first<{ rev: number }>()
    : baseRev === 0
      ? await db
          .prepare(`INSERT INTO app_state (user_id, data, rev, updated_at, device) VALUES (?1, ?2, 1, ?3, ?4) ON CONFLICT(user_id) DO NOTHING RETURNING rev`)
          .bind(user.id, text, now, device)
          .first<{ rev: number }>()
      : await db
          .prepare(`UPDATE app_state SET data = ?2, rev = rev + 1, updated_at = ?3, device = ?4 WHERE user_id = ?1 AND rev = ?5 RETURNING rev`)
          .bind(user.id, text, now, device, baseRev)
          .first<{ rev: number }>();
  if (!res) {
    const cur = await db.prepare("SELECT rev, updated_at, device FROM app_state WHERE user_id = ?1").bind(user.id).first<{ rev: number; updated_at: number; device: string }>();
    return c.json({ error: "conflict", rev: cur?.rev ?? 0, updatedAt: cur?.updated_at ?? 0, device: cur?.device ?? "" }, 409);
  }
  return c.json({ rev: res.rev, updatedAt: now });
});

app.post("/api/account/delete", async (c) => {
  const user = c.get("user");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM app_state WHERE user_id = ?1").bind(user.id),
    c.env.DB.prepare("DELETE FROM ai_usage WHERE user_id = ?1").bind(user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(user.id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(user.id),
  ]);
  deleteCookie(c, "sid", { path: "/" });
  return c.json({ ok: true });
});

// ---------- Workers AI ----------
async function aiGuard(c: C): Promise<Response | null> {
  const user = c.get("user");
  if (c.env.AI_LIMITER && !(await c.env.AI_LIMITER.limit({ key: user.id })).success) return c.json({ error: "rate_limited" }, 429);
  const day = new Date().toISOString().slice(0, 10);
  const usage = await c.env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, count) VALUES (?1, ?2, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(user.id, day)
    .first<{ count: number }>();
  return (usage?.count ?? 0) > AI_DAILY_LIMIT ? c.json({ error: "rate_limited" }, 429) : null;
}

async function runJSON(env: Env, system: string, user: string, schema: object, maxTokens: number): Promise<any> {
  const out: any = await env.AI.run(env.AI_MODEL as any, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: "json_schema", json_schema: schema },
  } as any);
  const r = out?.response ?? out?.choices?.[0]?.message?.content;
  if (r && typeof r === "object") return r;
  const json = String(r ?? "").match(/[[{][\s\S]*[\]}]/)?.[0];
  return json ? JSON.parse(json) : {};
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const FOODS = INGREDIENTS.filter((i) => !i.staple);
const STAPLES = INGREDIENTS.filter((i) => i.staple);
const FOOD_IDS = new Set(FOODS.map((i) => i.id));
const STAPLE_IDS = new Set(STAPLES.map((i) => i.id));
const CUTS = Object.keys(CUT_RATE);

// 料理名からレシピの構成（材料・分量・切り方・調理法）を作る。
// 工程・器具・衛生条件はクライアントの buildRecipe が組み立てるので、AI には構成だけを決めさせる。
app.post("/api/ai/recipe", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = clean(body.name, 40);
  if (!name) return c.json({ error: "bad_request" }, 400);
  const blocked = await aiGuard(c);
  if (blocked) return blocked;
  const system = [
    "あなたは一人暮らしの自炊を支える料理アシスタントです。料理名から、1人前のレシピの構成を JSON で返してください。",
    "入力は音声入力のため誤変換を含むことがあります。料理名として自然な表記に直してください（name）。",
    `method は次から最も近いものを1つ: ${METHODS.map((m) => `${m.id}=${m.label}`).join(" / ")}`,
    `role は main=主菜 / side=副菜 / soup=汁物 / one-dish=ご飯もの・麺。`,
    `items は主な材料。id は必ず次の一覧から選ぶ（一覧にない食材は最も近いもので代用し、無理なら使わない）: ${FOODS.map((i) => `${i.id}=${i.name}`).join(", ")}`,
    "items は3〜7種類。料理名に出てこなくても、その料理に一般的に入る具材（野菜・きのこ・味噌など）は必ず含める。",
    "grams は1人前のグラム数（肉・魚 80〜130、野菜 30〜120、米は items に入れない）。",
    "例：肉じゃが → method=nimono, items=[beef_koma 80 一口大, potato 120 一口大, onion 60 くし切り, carrot 30 乱切り], seasoning=[soy 12, mirin 12, sugar 4, dashi 2, oil 3]",
    `cut は切り方。次から選ぶか、切らない材料は null: ${CUTS.join("、")}`,
    `seasoning は調味料。id は次から: ${STAPLES.map((i) => `${i.id}=${i.name}`).join(", ")}。grams は1人前（醤油 5〜15、油 3〜8 など控えめに）。`,
    "freeze は冷凍の向き不向き（good / ok / ng）。fridgeDays は冷蔵で日持ちする日数、freezerDays は冷凍の日数。reheat は温め方を20字以内で。",
    "塩分は1人前2.5g以下を目安に控えめにする。",
  ].join("\n");
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      subtitle: { type: "string" },
      role: { type: "string", enum: ["main", "side", "soup", "one-dish"] },
      method: { type: "string", enum: METHODS.map((m) => m.id) },
      items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, grams: { type: "number" }, cut: { type: ["string", "null"] } }, required: ["id", "grams"] } },
      seasoning: { type: "array", items: { type: "object", properties: { id: { type: "string" }, grams: { type: "number" } }, required: ["id", "grams"] } },
      freeze: { type: "string", enum: ["good", "ok", "ng"] },
      fridgeDays: { type: "integer" },
      freezerDays: { type: "integer" },
      reheat: { type: "string" },
    },
    required: ["name", "role", "method", "items", "seasoning", "freeze"],
  };
  try {
    const out = await runJSON(c.env, system, `料理名: ${name}`, schema, 900);
    const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
    const seen = new Set<string>();
    const items = (Array.isArray(out?.items) ? out.items : [])
      .filter((i: any) => FOOD_IDS.has(i?.id) && !seen.has(i.id) && seen.add(i.id))
      .slice(0, 8)
      .map((i: any) => [i.id, num(i.grams, 5, 400) ?? 80, CUTS.includes(i.cut) ? i.cut : undefined]);
    const seen2 = new Set<string>();
    const seasoning = (Array.isArray(out?.seasoning) ? out.seasoning : [])
      .filter((i: any) => STAPLE_IDS.has(i?.id) && !seen2.has(i.id) && seen2.add(i.id))
      .slice(0, 8)
      .map((i: any) => [i.id, num(i.grams, 1, 60) ?? 5]);
    if (!items.length) return c.json({ error: "ai_failed" }, 502);
    const method = METHODS.some((m) => m.id === out?.method) ? out.method : "stirfry";
    const role = ["main", "side", "soup", "one-dish"].includes(out?.role) ? out.role : "main";
    return c.json({
      def: {
        name: clean(out?.name, 40) || name,
        subtitle: clean(out?.subtitle, 40) || undefined,
        role,
        method,
        items,
        seasoning,
        freeze: ["good", "ok", "ng"].includes(out?.freeze) ? out.freeze : "ok",
        fridgeDays: num(out?.fridgeDays, 0, 5) ?? undefined,
        freezerDays: num(out?.freezerDays, 0, 30) ?? undefined,

        rice: method === "donburi" || method === "fried-rice" || method === "omurice" ? 150 : undefined,
      },
    });
  } catch (e) {
    console.error("ai recipe failed", e);
    return c.json({ error: "ai_failed" }, 502);
  }
});

// 週間献立（ルールで組んだもの）に、AI が栄養・食費・段取りの観点で短い助言を付ける
app.post("/api/ai/plan-advice", async (c) => {
  const body = await c.req.json<{ summary?: string }>();
  const summary = clean(body.summary, 3000);
  if (!summary) return c.json({ error: "bad_request" }, 400);
  const blocked = await aiGuard(c);
  if (blocked) return blocked;
  const system = [
    "あなたは管理栄養士の視点を持つ自炊コーチです。一人暮らしの男性の今週の夕食献立について、具体的な助言を2〜3件返してください。",
    "各助言は50字以内の1文。必ず具体的な料理名か「◯日目」に触れ、理由と、どうすればよいか（行動）を書く。",
    "例：「3日目の麻婆豆腐は塩分が2.8gと多めなので、汁物を減らすか豆板醤を半量にする」「にんじんが4品で重なるので1本買いで足りる」",
    "観点は栄養（たんぱく質・野菜・塩分）、食費、作り置きの段取り、食材の使い回し。同じ観点を繰り返さない。",
    "目安：夕食のたんぱく質は25g以上なら十分、野菜は多いほど良い（減らす助言はしない）、塩分は1食3g以下が望ましい。目安を満たしている項目には触れない。",
    "数値は与えられた情報だけを使い、推測で数値を作らない。極端な減量やサプリを勧めない。励ましや決まり文句は不要。",
  ].join("\n");
  const schema = { type: "object", properties: { advice: { type: "array", items: { type: "string" } } }, required: ["advice"] };
  try {
    const out = await runJSON(c.env, system, summary, schema, 500);
    const advice = (Array.isArray(out?.advice) ? out.advice : []).map((s: unknown) => clean(s, 80)).filter(Boolean).slice(0, 3);
    return c.json({ advice });
  } catch (e) {
    console.error("ai advice failed", e);
    return c.json({ error: "ai_failed" }, 502);
  }
});

// ---------- 商品（バーコード） ----------
// JAN コードから Open Food Facts（誰でも編集できる公開の食品データベース）を引く。
// 見つかった値は「参考値」として登録画面に入れ、ユーザーが確認・修正してから保存する。
app.get("/api/products/lookup", async (c) => {
  const jan = (c.req.query("jan") ?? "").replace(/\D/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(jan)) return c.json({ error: "bad_request" }, 400);
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://cache.internal/off/${jan}`);
  const hit = await cache.match(key);
  if (hit) return c.json(await hit.json(), 200, { "cache-control": "private, max-age=3600" });
  let body: Record<string, unknown> = { found: false };
  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${jan}.json?fields=product_name,product_name_ja,product_name_en,brands,quantity,serving_size,nutriments`,
      { headers: { "user-agent": "kondate-web/1.0 (personal meal planner)" }, cf: { cacheTtl: 86400 } } as RequestInit,
    );
    if (r.ok) {
      const d = (await r.json()) as any;
      const p = d?.product;
      if (d?.status === 1 && p) {
        const n = p.nutriments ?? {};
        // 1食（1個）あたりがあれば優先、なければ100gあたり
        const per = n["energy-kcal_serving"] != null ? "serving" : "100g";
        const v = (k: string) => {
          const x = Number(n[`${k}_${per}`]);
          return Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
        };
        body = {
          found: true,
          name: clean(p.product_name_ja || p.product_name || p.product_name_en || p.brands, 60),
          brand: clean(p.brands, 40),
          quantity: clean(p.quantity, 30),
          per,
          nutrients: { kcal: v("energy-kcal"), protein: v("proteins"), fat: v("fat"), carbs: v("carbohydrates"), fiber: v("fiber"), salt: v("salt") },
        };
      }
    }
  } catch (e) {
    console.error("off lookup failed", e);
    return c.json({ found: false, error: "unavailable" }, 502);
  }
  const res = c.json(body, 200, { "cache-control": "private, max-age=3600" });
  await cache.put(key, new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "max-age=86400" } }));
  return res;
});

// 栄養成分表示の写真を Workers AI（画像対応モデル）で読み取る
app.post("/api/ai/label", async (c) => {
  const body = await c.req.json<{ image?: string }>();
  const img = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 2_400_000) return c.json({ error: "bad_request" }, 400);
  const blocked = await aiGuard(c);
  if (blocked) return blocked;
  const prompt = [
    "この写真は日本の食品パッケージです。栄養成分表示（または商品名）を読み取り、次のキーだけを持つ JSON を出力してください。",
    '{"name": 商品名（見えなければ ""）, "per": 表示の単位（例 "1個当たり" "100g当たり"）, "kcal": エネルギー, "protein": たんぱく質g, "fat": 脂質g, "carbs": 炭水化物g（糖質と食物繊維に分かれていれば合計）, "fiber": 食物繊維g（無ければ null）, "salt": 食塩相当量g}',
    "数値は表示どおりに読み、推測で埋めないこと。読めない項目は null。JSON 以外は出力しない。",
  ].join("\n");
  try {
    const out: any = await c.env.AI.run(c.env.VISION_MODEL as any, {
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: img } }] }],
      max_tokens: 400,
      temperature: 0,
    } as any);
    const r = out?.response ?? out?.choices?.[0]?.message?.content;
    const j = typeof r === "object" && r ? r : JSON.parse(String(r ?? "").match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const num = (x: unknown) => {
      const v = typeof x === "number" ? x : Number(String(x ?? "").replace(/[^\d.]/g, ""));
      return Number.isFinite(v) && String(x ?? "").trim() !== "" ? Math.round(v * 10) / 10 : null;
    };
    const res = { name: clean(j.name, 60), per: clean(j.per, 20), nutrients: { kcal: num(j.kcal), protein: num(j.protein), fat: num(j.fat), carbs: num(j.carbs), fiber: num(j.fiber), salt: num(j.salt) } };
    if (Object.values(res.nutrients).every((v) => v === null) && !res.name) return c.json({ error: "unreadable" }, 422);
    return c.json(res);
  } catch (e) {
    console.error("ai label failed", e);
    return c.json({ error: "ai_failed" }, 502);
  }
});

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
