import { createHmac, randomUUID } from 'node:crypto';

// One atomic Redis script, shared by every serverless instance. Only counters,
// daily HMAC visitor keys, and short-lived random lease IDs enter Redis.
export const ADMIT = `
local now = tonumber(ARGV[1])
local lease = ARGV[2]
local tokens = tonumber(ARGV[3])
local minuteLimit = tonumber(ARGV[4])
local visitorDayLimit = tonumber(ARGV[5])
local globalCalls = tonumber(ARGV[6])
local tokenLimit = tonumber(ARGV[7])
local maxConcurrent = tonumber(ARGV[8])
local leaseMs = tonumber(ARGV[9])
if tonumber(redis.call('GET', KEYS[1]) or '0') >= minuteLimit then return {1, 60} end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= visitorDayLimit then return {1, tonumber(ARGV[10])} end
if tokens > 0 then
  redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now)
  if redis.call('EXISTS', KEYS[6]) == 1 or redis.call('ZCARD', KEYS[5]) >= maxConcurrent then return {3, 2} end
  if tonumber(redis.call('GET', KEYS[3]) or '0') >= globalCalls or tonumber(redis.call('GET', KEYS[4]) or '0') + tokens > tokenLimit then return {2, tonumber(ARGV[10])} end
end
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 120)
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)
if tokens > 0 then
  redis.call('INCR', KEYS[3]); redis.call('EXPIRE', KEYS[3], 172800)
  redis.call('INCRBY', KEYS[4], tokens); redis.call('EXPIRE', KEYS[4], 172800)
  redis.call('ZADD', KEYS[5], now + leaseMs, lease); redis.call('EXPIRE', KEYS[5], 60)
  redis.call('SET', KEYS[6], lease, 'PX', leaseMs)
end
return {0, 0}
`;
export const RELEASE = `
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
return 1
`;
export class ServiceError extends Error {
  constructor(code, retryAfter = 0) { super(code); this.code = code; this.retryAfter = retryAfter; }
}
function integer(value, fallback, max) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ServiceError('unavailable');
  return n;
}
export function configuration(env) {
  const required = ['OPENAI_API_KEY','OPENAI_MODEL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ASSISTANT_RATE_LIMIT_SECRET'];
  if (required.some(name => typeof env[name] !== 'string' || !env[name].trim()) || env.ASSISTANT_RATE_LIMIT_SECRET.length < 32) throw new ServiceError('unavailable');
  let redisUrl; try { redisUrl = new URL(env.UPSTASH_REDIS_REST_URL); } catch { throw new ServiceError('unavailable'); }
  if (redisUrl.protocol !== 'https:' || !redisUrl.hostname.endsWith('.upstash.io') || redisUrl.username || redisUrl.password || redisUrl.search || redisUrl.hash || redisUrl.pathname !== '/') throw new ServiceError('unavailable');
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(env.OPENAI_MODEL)) throw new ServiceError('unavailable');
  return {
    redisUrl:redisUrl.origin, redisToken:env.UPSTASH_REDIS_REST_TOKEN, secret:env.ASSISTANT_RATE_LIMIT_SECRET,
    model:env.OPENAI_MODEL, apiKey:env.OPENAI_API_KEY,
    namespace:env.VERCEL_ENV === 'production' ? 'production' : 'preview',
    minute:integer(env.ASSISTANT_VISITOR_PER_MINUTE,5,10), daily:integer(env.ASSISTANT_VISITOR_PER_DAY,20,100),
    calls:integer(env.ASSISTANT_GLOBAL_CALLS_PER_DAY,50,200), tokens:integer(env.ASSISTANT_GLOBAL_TOKEN_ALLOWANCE,200000,1000000),
    concurrent:integer(env.ASSISTANT_MAX_CONCURRENT,2,5)
  };
}
export async function redisCommand(config, command, fetcher = fetch) {
  const response = await fetcher(config.redisUrl, {method:'POST',headers:{Authorization:'Bearer '+config.redisToken,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(2000),redirect:'error'});
  if (!response.ok) throw new ServiceError('unavailable');
  const raw = await response.text();
  if (raw.length > 2048) throw new ServiceError('unavailable');
  let body; try { body = JSON.parse(raw); } catch { throw new ServiceError('unavailable'); }
  if (!body || body.error || !Object.hasOwn(body,'result')) throw new ServiceError('unavailable');
  return body.result;
}
export async function admit(request, config, reservation, {fetcher=fetch,now=Date.now(),uuid=randomUUID()}={}) {
  const day = Math.floor(now / 86400000), minute = Math.floor(now / 60000);
  // Vercel supplies this header. Never accept a client-provided visitor ID.
  const ip = (request.headers.get('x-vercel-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,64);
  const visitor = createHmac('sha256',config.secret).update(day+':'+ip).digest('hex');
  const prefix = '{recruiter:'+config.namespace+'}:';
  const keys = [prefix+'v:'+visitor+':'+minute,prefix+'v:'+visitor+':day',prefix+'calls:'+day,prefix+'tokens:'+day,prefix+'active',prefix+'lock:'+visitor];
  const untilMidnight = Math.max(1,Math.ceil(((day+1)*86400000-now)/1000));
  const result = await redisCommand(config,['EVAL',ADMIT,6,...keys,now,uuid,reservation,config.minute,config.daily,config.calls,config.tokens,config.concurrent,25000,untilMidnight],fetcher);
  if (!Array.isArray(result) || result.length !== 2 || ![0,1,2,3].includes(result[0]) || !Number.isInteger(result[1])) throw new ServiceError('unavailable');
  if (result[0] !== 0) throw new ServiceError(result[0] === 3 ? 'busy' : result[0] === 2 ? 'budget' : 'rate_limit',Math.min(86400,Math.max(1,result[1])));
  return async () => {
    if (!reservation) return;
    try { await redisCommand(config,['EVAL',RELEASE,2,keys[4],keys[5],uuid],fetcher); } catch { /* Lease expires; never log an error object or message content. */ }
  };
}
