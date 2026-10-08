import {services} from './services.mjs';
import {discordMessages, extractCodes, trustedMessage, notifyDiscord} from './discord.mjs';

export function normalizeCode(input) {
  const code = typeof input === 'string' ? input.trim() : '';
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(code)) throw Error('コードは3〜64文字の英数字・ハイフン・アンダースコアで入力してください。');
  return code; // Case is significant to the existing API/history; never uppercase.
}
const terminal = new Set(['completed', 'failed', 'cancelled']);
const finishedPlayer = new Set(['done', 'skipped', 'failed', 'unknown']);
const summarize = (targets, final = false) => ({total:targets.length,success:targets.filter(p=>['done','skipped'].includes(p.status)).length,
  failed:targets.filter(p=>p.status==='failed').length,
  unknown:targets.filter(p=>p.status==='unknown'||(final&&!['done','skipped','failed'].includes(p.status))).length});

export class RedeemQueue {
  constructor(ctx, env, adapters = {...services,notifyDiscord}) {
    this.ctx = ctx;
    this.env = env;
    this.services = adapters;
    this.sql = ctx.storage.sql;
    this.polling = false;
    this.alarming = false;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS gift_codes (
      code TEXT PRIMARY KEY, status TEXT NOT NULL, detected_at INTEGER NOT NULL,
      started_at INTEGER, finished_at INTEGER, updated_at INTEGER NOT NULL,
      stop_requested INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS jobs_status ON gift_codes(status, detected_at)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
  rows(query, ...args) { return Array.from(this.sql.exec(query, ...args)); }
  get(code) {
    const row = this.rows('SELECT * FROM gift_codes WHERE code=?', code)[0];
    return row ? {...row, ...JSON.parse(row.payload), payload:undefined} : null;
  }
  save(job) {
    const {targets, source, initialized, errors, error, next_at, attempt} = job;
    let {notification} = job;
    const summary=summarize(targets||[],terminal.has(job.status));job.summary=summary;
    if(job.status==='failed'&&summary.failed+summary.unknown>0&&!notification){
      notification={status:'pending',attempts:0,next_at:Date.now(),sent_at:null,last_error:''};
      job.notification=notification;
    }
    this.sql.exec('UPDATE gift_codes SET status=?, started_at=?, finished_at=?, updated_at=?, payload=? WHERE code=?',
      job.status, job.started_at || null, job.finished_at || null, Date.now(),
      JSON.stringify({targets,source,initialized,errors,error,next_at,attempt,summary,notification}), job.code);
  }
  meta(key) { return this.rows('SELECT value FROM metadata WHERE key=?',key)[0]?.value; }
  setMeta(key, value) { this.sql.exec('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,value); }
  async wake(delay = 1000) {
    const active = this.rows("SELECT code FROM gift_codes WHERE status IN ('pending','processing') LIMIT 1");
    const notify = this.rows("SELECT code FROM gift_codes WHERE status IN ('completed','failed','cancelled') ORDER BY updated_at DESC LIMIT 30")
      .map(row=>this.get(row.code)).find(job=>['pending','failed'].includes(job.notification?.status)&&job.notification.attempts<5);
    if (!active.length && !notify) return;
    if(!active.length&&notify)delay=Math.max(delay,notify.notification.next_at-Date.now());
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || alarm > Date.now() + delay) await this.ctx.storage.setAlarm(Date.now() + delay);
  }
  async submit(code, source, retry = false, acknowledgeUnknown = false) {
    code = normalizeCode(code);
    let job = this.get(code), duplicate = Boolean(job);
    if (job && retry && terminal.has(job.status)) {
      if (job.targets.some(p => p.status === 'unknown') && !acknowledgeUnknown) throw Error('結果未確認のプレイヤーがいます。ゲーム内確認後に再実行してください。');
      job.targets = job.targets.map(p => ['failed','unknown','pending'].includes(p.status) ? {...p,status:'pending',attempts:0,msg:''} : p);
      job.status = 'pending'; job.finished_at = null; job.started_at = null;
      job.initialized = false; job.errors = 0; job.error = ''; job.next_at = 0; job.attempt++;
      job.notification = null;
      this.sql.exec('UPDATE gift_codes SET stop_requested=0 WHERE code=?',code);
      this.save(job);
    } else if (!job) {
      const count = this.rows("SELECT COUNT(*) AS n FROM gift_codes WHERE status IN ('pending','processing')")[0].n;
      if (count >= 20) throw Error('交換待ちが多いため、完了を待ってください。');
      const now = Date.now();
      this.sql.exec('INSERT INTO gift_codes(code,status,detected_at,updated_at,payload) VALUES(?,?,?,?,?)',
        code,'pending',now,now,JSON.stringify({source,targets:[],initialized:false,errors:0,error:'',next_at:0,attempt:1,summary:summarize([]),notification:null}));
    }
    await this.wake();
    return {duplicate, job:this.get(code)};
  }
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/submit') {
        const input = await request.json();
        return Response.json(await this.submit(input.code,input.source,input.retry,input.acknowledgeUnknown));
      }
      if (url.pathname === '/jobs') {
        const code = url.searchParams.get('code');
        if (code) return Response.json({job:this.get(normalizeCode(code))});
        const jobs = this.rows('SELECT code FROM gift_codes ORDER BY detected_at DESC LIMIT 20').map(r => this.get(r.code));
        const unresolved=this.rows("SELECT code FROM gift_codes WHERE status='failed'").map(r=>this.get(r.code))
          .reduce((count,value)=>count+(value.summary?.failed||0)+(value.summary?.unknown||0),0);
        return Response.json({jobs,unresolved,discord:{enabled:this.env.DISCORD_ENABLED==='true',...JSON.parse(this.meta('discord_status') || '{}')}});
      }
      if (url.pathname === '/cancel') {
        const {code} = await request.json();
        this.sql.exec("UPDATE gift_codes SET stop_requested=1 WHERE code=? AND status IN ('pending','processing')",normalizeCode(code));
        await this.wake();
        return Response.json({job:this.get(code)});
      }
      if (url.pathname === '/tick') {
        await this.wake();
        await this.pollDiscord();
        return Response.json({ok:true});
      }
      return new Response('Not found',{status:404});
    } catch (error) { return Response.json({error:error.message},{status:400}); }
  }

  async alarm() {
    if (this.alarming) return;
    this.alarming = true;
    let job;
    try {
      const row = this.rows("SELECT code FROM gift_codes WHERE status IN ('pending','processing') ORDER BY CASE status WHEN 'processing' THEN 0 ELSE 1 END, detected_at LIMIT 1")[0];
      let notificationOnly=false;
      if(row)job=this.get(row.code);
      else {
        job=this.rows("SELECT code FROM gift_codes WHERE status IN ('completed','failed','cancelled') ORDER BY updated_at DESC LIMIT 30")
          .map(value=>this.get(value.code)).find(value=>['pending','failed'].includes(value.notification?.status)&&value.notification.attempts<5&&value.notification.next_at<=Date.now());
        notificationOnly=Boolean(job);
      }
      if (!job) return;
      // Leave a durable watchdog even if the process disappears during an await.
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      if(notificationOnly){
        try{await this.services.notifyDiscord(this.env,job);job.notification={...job.notification,status:'sent',sent_at:Date.now(),last_error:''};}
        catch(error){job.notification={...job.notification,status:'failed',attempts:job.notification.attempts+1,next_at:Date.now()+Math.max(60,error.retryAfter||60)*1000,last_error:error.message};}
        this.save(job);return;
      }
      if (job.next_at > Date.now()) return;
      job.status = 'processing'; job.started_at ||= Date.now();
      this.save(job);
      // An interrupted call may already have exchanged the gift at the provider.
      for (const p of job.targets) if (p.status === 'sending') {p.status='unknown';p.msg='通信が中断し結果未確認。ゲーム内を確認してください。';}
      this.save(job);
      if (!job.initialized) {
        const incoming = await this.services.loadTargets(this.env,job.code);
        const previous = new Map(job.targets.map(p => [p.fid,p]));
        job.targets = incoming.map(p => previous.get(p.fid)?.status === 'recording' ? previous.get(p.fid) :
          p.status === 'skipped' ? p : previous.get(p.fid) || p);
        job.initialized = true; job.errors = 0; job.error = ''; this.save(job);
      }
      // Persist provider-success records even when cancellation was requested.
      const recording = job.targets.find(p => p.status === 'recording');
      if (recording) {
        await this.services.writeHistory(this.env,job.code,recording,recording.result);
        recording.status='done'; job.errors=0; this.save(job);
      } else if (this.get(job.code).stop_requested) {
        job.status='cancelled'; job.finished_at=Date.now(); this.save(job); return;
      } else {
        const player = job.targets.find(p => p.status === 'pending');
        if (player) {
          player.status='sending'; player.attempts++; this.save(job);
          let result;
          try { result = await this.services.redeemPlayer(this.env,job.code,player); }
          catch {
            player.status='unknown'; player.msg='通信エラーで結果未確認。ゲーム内を確認してください。';
            this.save(job); return;
          }
          player.result=result; player.msg=result.msg;
          if (result.done) {
            player.status='recording'; this.save(job);
            await this.services.writeHistory(this.env,job.code,player,result);
            player.status='done';
          } else if (result.retry && player.attempts < 3) {
            player.status='pending'; job.next_at=Date.now()+5000;
          } else player.status='failed';
          if (result.bad_cdk) {
            for(const pending of job.targets.filter(value=>value.status==='pending')){pending.status='failed';pending.msg=result.msg;}
            job.status='failed';job.error=result.msg;job.finished_at=Date.now();
          }
          this.save(job);
        }
      }
      if (job.status === 'processing' && job.targets.every(p => finishedPlayer.has(p.status))) {
        job.status = job.targets.length && !job.targets.some(p => ['failed','unknown'].includes(p.status)) ? 'completed' : 'failed';
        job.error = job.targets.length ? '' : '登録プレイヤーがいません。';
        job.summary=summarize(job.targets);
        if(job.summary.failed+job.summary.unknown>0)job.notification={status:'pending',attempts:0,next_at:Date.now(),sent_at:null,last_error:''};
        job.finished_at=Date.now(); this.save(job);
      }
    } catch (error) {
      if (job) {
        job.errors=(job.errors||0)+1; job.error=error.message; job.next_at=Date.now()+60000;
        if (job.errors >= 5) {job.status='failed';job.finished_at=Date.now();}
        this.save(job);
      }
    } finally {
      this.alarming = false;
      await this.ctx.storage.deleteAlarm();
      const due=job?.notification&&['pending','failed'].includes(job.notification.status)?job.notification.next_at:job?.next_at||0;
      await this.wake(Math.max(2200, due-Date.now()));
    }
  }

  async pollDiscord() {
    if (this.polling || this.env.DISCORD_ENABLED !== 'true') return;
    if (!this.env.DISCORD_BOT_TOKEN || !this.env.DISCORD_CHANNEL_ID) return;
    if (!String(this.env.DISCORD_AUTHOR_IDS||'').trim() && !String(this.env.DISCORD_WEBHOOK_IDS||'').trim()) {
      this.setMeta('discord_status',JSON.stringify({status:'failed',checked_at:Date.now(),message:'監視対象の投稿者または投稿Botを設定してください。'}));
      return;
    }
    if (Number(this.meta('discord_retry_at') || 0) > Date.now()) return;
    this.polling = true;
    try {
      // First connection establishes a watermark, preventing an old-code flood.
      let cursor = this.meta('discord_cursor');
      if (!cursor) {
        const channelResponse=await fetch(`https://discord.com/api/v10/channels/${this.env.DISCORD_CHANNEL_ID}`, {
          headers:{Authorization:`Bot ${this.env.DISCORD_BOT_TOKEN}`},signal:AbortSignal.timeout(15000)
        });
        if(!channelResponse.ok)throw Error(`Discordチャンネルを確認できません（HTTP ${channelResponse.status}）。`);
        const channel=await channelResponse.json();
        if(channel.guild_id!==this.env.DISCORD_GUILD_ID)throw Error('設定したサーバーとチャンネルが一致しません。');
        const messages = await discordMessages(this.env);
        cursor = messages.reduce((max,m) => BigInt(m.id)>BigInt(max)?m.id:max,'0');
        this.setMeta('discord_cursor',cursor);
        this.setMeta('discord_status',JSON.stringify({status:'ready',checked_at:Date.now(),message:'接続開始以降の新着を監視します。'}));
        return;
      }
      // Bounded pagination; backlog is consumed on subsequent cron runs.
      for (let page=0;page<5;page++) {
        const messages = (await discordMessages(this.env,'&after='+cursor)).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
        if (!messages.length) break;
        for (const message of messages) {
          if (trustedMessage(message,this.env)) {
            for (const code of extractCodes(message)) await this.submit(code,{type:'discord',channel_id:message.channel_id,message_id:message.id});
          }
          // Advance only after all extracted codes have been durably accepted.
          cursor=message.id; this.setMeta('discord_cursor',cursor);
        }
        if(messages.length<100) break;
      }
      this.setMeta('discord_status',JSON.stringify({status:'ready',checked_at:Date.now()}));
    } catch(error) {
      this.setMeta('discord_retry_at',String(Date.now()+Math.max(60,error.retryAfter||60)*1000));
      this.setMeta('discord_status',JSON.stringify({status:'failed',checked_at:Date.now(),message:error.message}));
    } finally {this.polling=false;}
  }
}
