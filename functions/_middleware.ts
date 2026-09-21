// Cloudflare Pages Functions Middleware for ComicBoard Geolocation, Subdomain & Auto-Language Detection

const COUNTRY_TO_LOCALE: Record<string, string> = {
  FR: 'fr', // France
  DE: 'de', // Germany
  AT: 'de', // Austria
  CH: 'de', // Switzerland
  ES: 'es', // Spain
  MX: 'es', // Mexico
  AR: 'es', // Argentina
  CO: 'es', // Colombia
  CL: 'es', // Chile
  PE: 'es', // Peru
  JP: 'ja', // Japan
  KR: 'ko', // South Korea
  CN: 'zh', // China
  TW: 'zh', // Taiwan
  HK: 'zh', // Hong Kong
};

const BOT_REGEX =
  /bot|googlebot|crawler|spider|robot|crawling|bingbot|yandex|duckduckbot|baiduspider|slurp|headless/i;

export const onRequest = async (context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const { request, next } = context;
  const url = new URL(request.url);

  // 1. Directly serve Google Search Console verification without 308 redirect
  if (url.pathname === '/google89b79b3a1ee865f8.html') {
    return new Response('google-site-verification: google89b79b3a1ee865f8.html', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    });
  }

  // 2. Directly serve ads.txt
  if (url.pathname === '/ads.txt') {
    return new Response('google.com, pub-6499357447763670, DIRECT, f08c47fec0942fa0', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    });
  }

  // Pass-through if not root or static resource
  if (url.pathname !== '/' && url.pathname !== '') {
    return next();
  }

  // 3. Never redirect crawlers (preserves Google SEO indexing)
  const userAgent = request.headers.get('user-agent') || '';
  if (BOT_REGEX.test(userAgent)) {
    return next();
  }

  // 4. Check if user already has an explicit language query or cookie
  if (url.searchParams.has('lang')) {
    return next();
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const cookieMatch = cookieHeader.match(/user_lang_pref=([a-z]{2})/i);
  if (cookieMatch) {
    const prefLang = cookieMatch[1].toLowerCase();
    if (prefLang !== 'en') {
      url.searchParams.set('lang', prefLang);
      return Response.redirect(url.toString(), 302);
    }
    return next();
  }

  // 5. Inspect Cloudflare Geo-IP Country
  const country = request.headers.get('cf-ipcountry')?.toUpperCase();
  let targetLocale = country ? COUNTRY_TO_LOCALE[country] : null;

  // 6. Fallback to Accept-Language
  if (!targetLocale) {
    const acceptLanguage = request.headers.get('accept-language')?.toLowerCase() || '';
    if (acceptLanguage.startsWith('fr') || acceptLanguage.includes(',fr')) targetLocale = 'fr';
    else if (acceptLanguage.startsWith('de') || acceptLanguage.includes(',de')) targetLocale = 'de';
    else if (acceptLanguage.startsWith('es') || acceptLanguage.includes(',es')) targetLocale = 'es';
    else if (acceptLanguage.startsWith('ja') || acceptLanguage.includes(',ja')) targetLocale = 'ja';
    else if (acceptLanguage.startsWith('ko') || acceptLanguage.includes(',ko')) targetLocale = 'ko';
    else if (acceptLanguage.startsWith('zh') || acceptLanguage.includes(',zh')) targetLocale = 'zh';
  }

  if (targetLocale && targetLocale !== 'en') {
    url.searchParams.set('lang', targetLocale);
    return Response.redirect(url.toString(), 302);
  }

  return next();
};
