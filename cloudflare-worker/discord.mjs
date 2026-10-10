// Only explicitly labelled codes from an allowlisted source are actionable.
export function extractCodes(message) {
  const text = [message.content || '', ...(message.embeds || []).flatMap(e => [e.title || '', e.description || '',
    ...(e.fields || []).map(f => `${f.name}: ${f.value}`)])].join('\n');
  if (!/New\s+Whiteout\s+Survival\s+Gift\s+Code|新(?:しい|着)?[^\n]{0,15}ギフトコード/i.test(text)) return [];
  const codes = new Set();
  const lines=text.split(/\r?\n/);
  for (let index=0;index<lines.length;index++) {
    const line=lines[index];
    // Heading alone is not a code; URLs and ordinary words are never guessed.
    const clean = line.replace(/[*`]/g, '').trim();
    const match = clean.match(/^(?:🎁\s*|🎮\s*)?(?:(?:Gift|Redeem|Redemption)\s+)?(?:Code|CDK|ギフトコード|交換コード)\s*[:：]\s*([A-Za-z0-9_-]{3,64})\s*$/i);
    if (match) codes.add(match[1]);
    if (/^(?:🎁\s*)?(?:(?:Gift|Redeem|Redemption)\s+)?(?:Code|CDK|ギフトコード|交換コード)\s*[:：]?\s*$/i.test(clean)) {
      const next=(lines[index+1]||'').replace(/[*`]/g,'').trim();
      if(/^[A-Za-z0-9_-]{3,64}$/.test(next))codes.add(next);
    }
  }
  return [...codes];
}

export function trustedMessage(message, env) {
  if (message.channel_id !== env.DISCORD_CHANNEL_ID) return false;
  const authors = String(env.DISCORD_AUTHOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const webhooks = String(env.DISCORD_WEBHOOK_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (message.webhook_id) return webhooks.includes(message.webhook_id);
  return authors.includes(message.author?.id);
}

export async function discordMessages(env, query = '') {
  const response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages?limit=100${query}`, {
    headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}, signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const error = Error(`Discordの読込に失敗しました（HTTP ${response.status}）。`);
    error.retryAfter = Number(response.headers.get('retry-after')) || 60;
    throw error;
  }
  return response.json();
}

function failureGroup(message = '') {
  if (/サーバービジー|操作頻度|頻度制限/.test(message)) return 'サーバービジー';
  if (/条件|レベル不足|登録期間|専用コード/.test(message)) return '条件未達';
  if (/結果未確認|通信/.test(message)) return '結果未確認';
  return 'その他';
}

export function notificationText(job) {
  const summary=job.summary || {total:job.targets.length,success:job.targets.filter(p=>['done','skipped'].includes(p.status)).length,
    failed:job.targets.filter(p=>p.status==='failed').length,unknown:job.targets.filter(p=>p.status==='unknown').length};
  if(job.status==='expired')return `🎁 ${job.code}：交換受付終了\n成功${summary.success}人／期限切れ確認${summary.expired||0}人／未実行${summary.unprocessed||0}人`;
  if(job.status==='invalid')return `⚠️ ${job.code}：無効なコード\n成功${summary.success}人／未実行${summary.unprocessed||0}人`;
  const unresolved=job.targets.filter(p=>['failed','unknown'].includes(p.status));
  const groups=new Map();
  for(const player of unresolved){const label=failureGroup(player.msg);groups.set(label,(groups.get(label)||0)+1);}
  const headline=`⚠️ ${job.code}：${summary.total}人中${summary.success}人成功、${summary.failed+summary.unknown}人失敗`;
  const reasons=[...groups].map(([label,count])=>`${label}：${count}人`).join('／');
  return reasons ? `${headline}\n${reasons}` : headline;
}

export async function notifyDiscord(env, job) {
  const channel=env.DISCORD_NOTIFY_CHANNEL_ID || env.DISCORD_CHANNEL_ID;
  const response=await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method:'POST',headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({content:notificationText(job),allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok){const error=Error(`Discord通知に失敗しました（HTTP ${response.status}）。`);error.retryAfter=Number(response.headers.get('retry-after'))||60;throw error;}
  return response.json();
}
