// EazyOPC Pro 授权服务（部署在 comicboard.eazyopc.com，5 个站共用这一个服务）
// 每个站单独售卖：在哪个站购买，就只解锁哪个站（按商品 ID 区分）。
//
// 路由：
//   GET  /api/pro/checkout?site=graph             → 创建该站商品的 Creem 结账页并 302 跳转（付款后跳回该站）
//   POST /api/pro/verify   {site, checkout_id}     → 向 Creem 核实订单已付款且是该站商品，返回卡密
//   POST /api/pro/activate {site, key}             → 在新设备上激活该站卡密
//   POST /api/pro/validate {site, key, instance_id} → 复查卡密是否仍有效（退款 / 禁用后失效）
//
// Cloudflare 环境变量：
//   CREEM_API_KEY             必填（加密变量）
//   CREEM_PRODUCT_<站名大写>  选填，覆盖该站商品 ID，如 CREEM_PRODUCT_GRAPH=prod_xxx
//   CREEM_TEST_MODE           选填，"1" 时走 Creem 测试环境

interface Env {
  CREEM_API_KEY?: string;
  CREEM_TEST_MODE?: string;
  [key: string]: string | undefined;
}

const SITES = ['comicboard', 'chalkboard', 'graph', 'whiteboard', 'kidsdraw'];
// 各站对应的 Creem 商品。chalkboard / graph / whiteboard / kidsdraw 建好专属商品后改这里（或设环境变量）。
const SITE_PRODUCTS: Record<string, string> = {
  comicboard: 'prod_4HLQAqNtCJigYN27XHBKee',
  chalkboard: 'prod_67fz975idTqLQ4QNWfb5in',
  graph: 'prod_67fz975idTqLQ4QNWfb5in',
  whiteboard: 'prod_67fz975idTqLQ4QNWfb5in',
  kidsdraw: 'prod_67fz975idTqLQ4QNWfb5in',
};
const OWN_KEY_PREFIX = 'EZPRO1-';

const ORIGIN_RE = /^https:\/\/(comicboard|chalkboard|graph|whiteboard|kidsdraw)\.eazyopc\.com$|^http:\/\/localhost(:\d+)?$/;

function apiBase(env: Env) {
  return env.CREEM_TEST_MODE === '1' ? 'https://test-api.creem.io' : 'https://api.creem.io';
}

function siteOf(value: unknown) {
  const s = String(value || '');
  return SITES.includes(s) ? s : '';
}

function productForSite(env: Env, site: string) {
  return (env['CREEM_PRODUCT_' + site.toUpperCase()] || SITE_PRODUCTS[site] || '').trim();
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  if (!ORIGIN_RE.test(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(request: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(request) },
  });
}

async function creem(env: Env, method: string, path: string, body?: unknown) {
  const res = await fetch(apiBase(env) + path, {
    method,
    headers: { 'x-api-key': env.CREEM_API_KEY || '', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { status: res.status, ok: res.ok, data };
}

// 本服务自签卡密：EZPRO1-<checkout_id>-<签名>。商品未开启 Creem License Key 时作为兜底。
async function sign(env: Env, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ezpro:' + (env.CREEM_API_KEY || '')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...sig.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function makeOwnKey(env: Env, checkoutId: string) {
  return OWN_KEY_PREFIX + checkoutId + '-' + (await sign(env, checkoutId));
}

async function parseOwnKey(env: Env, key: string) {
  if (!key.toUpperCase().startsWith(OWN_KEY_PREFIX)) return null;
  const rest = key.slice(OWN_KEY_PREFIX.length);
  const cut = rest.lastIndexOf('-');
  if (cut <= 0) return null;
  const checkoutId = rest.slice(0, cut);
  const given = rest.slice(cut + 1).toUpperCase();
  const expected = await sign(env, checkoutId);
  return given === expected ? checkoutId : null;
}

function productIdOf(obj: any): string {
  if (!obj) return '';
  if (typeof obj.product === 'string') return obj.product;
  return obj.product?.id || obj.product_id || '';
}

// 查询结账单是否已付款、且是该站的 Pro 商品
async function loadPaidCheckout(env: Env, site: string, checkoutId: string) {
  const r = await creem(env, 'GET', '/v1/checkouts?checkout_id=' + encodeURIComponent(checkoutId));
  if (!r.ok || !r.data) return { paid: false, reason: r.status === 404 ? 'not_found' : 'creem_error', status: r.status };
  const c = r.data;
  const orderStatus = c.order?.status;
  const paid = c.status === 'completed' && (!orderStatus || orderStatus === 'paid');
  if (!paid) return { paid: false, reason: 'not_paid' };
  if (productIdOf(c) !== productForSite(env, site)) return { paid: false, reason: 'wrong_product' };
  return { paid: true, checkout: c };
}

async function handleCheckout(request: Request, env: Env) {
  const url = new URL(request.url);
  const site = siteOf(url.searchParams.get('site')) || 'comicboard';
  const productId = productForSite(env, site);
  const fallback = `https://www.creem.io/payment/${productId}`;
  if (!env.CREEM_API_KEY) return Response.redirect(fallback, 302);
  const r = await creem(env, 'POST', '/v1/checkouts', {
    product_id: productId,
    request_id: `${site}-${Date.now()}`,
    success_url: `https://${site}.eazyopc.com/?pro_return=1`,
    metadata: { site },
  });
  const target = r.ok && r.data?.checkout_url ? r.data.checkout_url : fallback;
  return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'no-store' } });
}

async function readBody(request: Request): Promise<any> {
  try { return await request.json(); } catch (e) { return {}; }
}

async function handleVerify(request: Request, env: Env) {
  const { checkout_id, site: rawSite } = await readBody(request);
  const site = siteOf(rawSite);
  if (!site) return json(request, 400, { ok: false, reason: 'missing_site' });
  if (!checkout_id || typeof checkout_id !== 'string') return json(request, 400, { ok: false, reason: 'missing_checkout_id' });
  const r = await loadPaidCheckout(env, site, checkout_id);
  if (!r.paid) return json(request, 402, { ok: false, reason: r.reason });
  const c: any = r.checkout;
  const creemKey = (Array.isArray(c.license_keys) && c.license_keys[0]?.key) || c.license_key?.key || '';
  if (creemKey) {
    const a = await creem(env, 'POST', '/v1/licenses/activate', { key: creemKey, instance_name: 'eazyopc-web-' + Date.now() });
    if (a.ok && a.data?.instance?.id) {
      return json(request, 200, { ok: true, key: creemKey, instance_id: a.data.instance.id, email: c.customer?.email || '' });
    }
  }
  return json(request, 200, { ok: true, key: await makeOwnKey(env, checkout_id), instance_id: '', email: c.customer?.email || '' });
}

async function handleActivate(request: Request, env: Env) {
  const body = await readBody(request);
  const site = siteOf(body.site);
  const key = String(body.key || '').trim();
  if (!site) return json(request, 400, { ok: false, reason: 'missing_site' });
  if (key.length < 8) return json(request, 400, { ok: false, reason: 'invalid_key' });
  const own = await parseOwnKey(env, key);
  if (own) {
    const r = await loadPaidCheckout(env, site, own);
    return r.paid ? json(request, 200, { ok: true, key, instance_id: '' }) : json(request, 403, { ok: false, reason: r.reason });
  }
  const a = await creem(env, 'POST', '/v1/licenses/activate', { key, instance_name: 'eazyopc-web-' + Date.now() });
  if (a.status === 403) return json(request, 403, { ok: false, reason: 'activation_limit' });
  if (!a.ok || !a.data) return json(request, a.status === 404 || a.status === 410 ? 403 : 502, { ok: false, reason: a.status === 404 ? 'invalid_key' : a.status === 410 ? 'revoked' : 'creem_error' });
  if ((a.data.product_id || '') !== productForSite(env, site)) {
    // 其他站的卡密：撤销刚才的激活，避免白白占用设备名额
    if (a.data.instance?.id) await creem(env, 'POST', '/v1/licenses/deactivate', { key, instance_id: a.data.instance.id });
    return json(request, 403, { ok: false, reason: 'wrong_product' });
  }
  if (a.data.status && !['active', 'inactive'].includes(a.data.status)) return json(request, 403, { ok: false, reason: 'revoked' });
  return json(request, 200, { ok: true, key, instance_id: a.data.instance?.id || '' });
}

async function handleValidate(request: Request, env: Env) {
  const body = await readBody(request);
  const site = siteOf(body.site);
  const key = String(body.key || '').trim();
  const instanceId = String(body.instance_id || '').trim();
  if (!site) return json(request, 400, { ok: false, reason: 'missing_site' });
  if (!key) return json(request, 400, { ok: false, reason: 'invalid_key' });
  const own = await parseOwnKey(env, key);
  if (own) {
    const r = await loadPaidCheckout(env, site, own);
    if (r.paid) return json(request, 200, { ok: true });
    // 只有 Creem 明确告知「未付款 / 不存在 / 商品不符」才判定失效；网络故障时保持现状
    return r.reason === 'creem_error' ? json(request, 502, { ok: false, reason: 'creem_error' }) : json(request, 403, { ok: false, reason: r.reason });
  }
  if (!instanceId) return json(request, 400, { ok: false, reason: 'missing_instance' });
  const v = await creem(env, 'POST', '/v1/licenses/validate', { key, instance_id: instanceId });
  if (v.status === 404 || v.status === 410) return json(request, 403, { ok: false, reason: 'revoked' });
  if (!v.ok || !v.data) return json(request, 502, { ok: false, reason: 'creem_error' });
  if ((v.data.product_id || '') !== productForSite(env, site)) return json(request, 403, { ok: false, reason: 'wrong_product' });
  if (v.data.status !== 'active') return json(request, 403, { ok: false, reason: 'revoked' });
  return json(request, 200, { ok: true });
}

export const onRequest = async (context: { request: Request; env: Env; params: { action?: string } }) => {
  const { request, env } = context;
  const action = String(context.params.action || '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    if (action === 'checkout' && request.method === 'GET') return await handleCheckout(request, env);
    if (request.method !== 'POST') return json(request, 405, { ok: false, reason: 'method_not_allowed' });
    if (!env.CREEM_API_KEY) return json(request, 503, { ok: false, reason: 'not_configured' });
    if (action === 'verify') return await handleVerify(request, env);
    if (action === 'activate') return await handleActivate(request, env);
    if (action === 'validate') return await handleValidate(request, env);
    return json(request, 404, { ok: false, reason: 'not_found' });
  } catch (e) {
    return json(request, 500, { ok: false, reason: 'server_error' });
  }
};
