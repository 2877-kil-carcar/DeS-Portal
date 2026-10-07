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
