import '../apps/redeem/protocol.js';

const PROJECT = 'des-portal-gift-code';
const DATABASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const encoder = new TextEncoder();
let accessToken, jwks;
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(15000)});
  if (!response.ok) {
    const error = new Error(`接続先がHTTP ${response.status}を返しました。`);
    error.status = response.status;
    error.retryAfter = Number(response.headers.get('retry-after')) || 60;
    throw error;
  }
  return response.json();
}

export async function secretMatches(actual, expected) {
  if (!actual || !expected) return false;
  const [a, b] = await Promise.all([actual, expected].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

export async function verifyFirebaseToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const head = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    const body = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (head.alg !== 'RS256' || body.aud !== PROJECT || body.iss !== `https://securetoken.google.com/${PROJECT}` ||
        !body.sub || typeof body.sub !== 'string' || body.sub.length > 128 || !Number.isFinite(body.exp) || body.exp <= now ||
        !Number.isFinite(body.iat) || body.iat > now + 60 || !Number.isFinite(body.auth_time) || body.auth_time > now + 60) return false;
    if (!jwks || jwks.until < Date.now() || !jwks.keys.some(k => k.kid === head.kid)) {
      const data = await jsonFetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      jwks = {...data, until: Date.now() + 3600000};
    }
    const found = jwks.keys.find(k => k.kid === head.kid);
    if (!found) return false;
    const key = await crypto.subtle.importKey('jwk', found, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
  } catch { return false; }
}

async function firebaseAccessToken(env) {
  if (accessToken && accessToken.until > Date.now()) return accessToken.value;
  if (!env.FIREBASE_API_KEY) throw Error('Firebaseの接続設定が未設定です。');
  const result = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({returnSecureToken:true})
  });
  if (!result.idToken) throw Error('Firebaseの匿名認証に失敗しました。');
  accessToken = {value:result.idToken, until:Date.now() + Math.max(60, Number(result.expiresIn || 3600) - 120) * 1000};
  return accessToken.value;
}

async function firestore(env, suffix, method = 'GET', body) {
  return jsonFetch(DATABASE + suffix, {method, headers:{Authorization:`Bearer ${await firebaseAccessToken(env)}`, 'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {})});
}
function fields(doc) {
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v]) => [k, v.stringValue ?? v.integerValue ?? v.timestampValue]));
}
export async function loadTargets(env, code) {
  const players = [];
  let pageToken = '';
  do {
    const page = await firestore(env, '/redeemPlayers?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    players.push(...(page.documents || []).map(fields));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  const records = await firestore(env, ':runQuery', 'POST', {structuredQuery:{from:[{collectionId:'redeemHistory'}],
    where:{fieldFilter:{field:{fieldPath:'cdk'}, op:'EQUAL', value:{stringValue:code}}}}});
  const done = new Set(records.filter(r => r.document).map(r => fields(r.document).fid));
  return players.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja')).map(p => ({
    fid:String(p.fid || ''), kid:String(p.kid || '2856'), name:String(p.name || ''),
    status:done.has(p.fid) ? 'skipped' : 'pending', attempts:0, msg:done.has(p.fid) ? '記録済み' : ''
  }));
}
export async function writeHistory(env, code, player, result) {
  const id = encodeURIComponent(encodeURIComponent(code) + '--' + player.fid);
  const now = new Date();
  const data = {cdk:code, fid:player.fid, msg:result.msg, atText:now.toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'})};
  await firestore(env, '/redeemHistory/' + id, 'PATCH', {fields:{
    ...Object.fromEntries(Object.entries(data).map(([k,v]) => [k, {stringValue:String(v)}])), updatedAt:{timestampValue:now.toISOString()}
  }});
}
export async function redeemPlayer(_env, code, player) {
  if (!/^\d{1,20}$/.test(player.fid) || !/^\d{1,10}$/.test(player.kid)) return {done:false, msg:'ID・王国が不正です。', retry:false};
  const body = new FormData();
  const {signed, interpret} = globalThis.WOS_REDEEM_PROTOCOL;
  for (const [key,value] of Object.entries(signed({fid:player.fid,kid:player.kid,cdk:code,time:Math.floor(Date.now()/1000)}))) body.append(key,String(value));
  return interpret(await jsonFetch('https://wos-giftcode-api.centurygame.com/api/gift_code', {method:'POST', body,
    headers:{Origin:'https://wos-giftcode.centurygame.com', Referer:'https://wos-giftcode.centurygame.com/', Accept:'application/json', 'User-Agent':'Mozilla/5.0'}}));
}

export const services = {loadTargets, writeHistory, redeemPlayer};
