-- Token-bucket rate limiter, evaluated atomically on the Redis server.
--
-- A Lua script runs to completion without interleaving from other clients,
-- which is the entire reason this exists instead of an app-side
-- GET-then-SET: two concurrent requests for the same bucket would otherwise
-- both read the same "tokens remaining" value and both decide they're
-- allowed, letting the bucket go negative under load. One EVALSHA round
-- trip makes read-refill-consume-write a single indivisible step.
--
-- KEYS[1] = bucket key (see REDIS_KEYS.rateLimit in src/config/redis.js)
-- ARGV[1] = capacity          (max tokens the bucket can hold)
-- ARGV[2] = refill_per_sec    (tokens added per second, may be fractional)
-- ARGV[3] = now_ms            (current time in ms, passed in by the caller
--                               rather than read via redis.call("TIME") so
--                               behaviour is deterministic and testable)
-- ARGV[4] = requested         (tokens this request costs; normally 1)
--
-- Returns: { allowed (0/1), tokens_remaining (string), retry_after_ms (int) }

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "updated_at_ms")
local tokens = tonumber(bucket[1])
local updated_at_ms = tonumber(bucket[2])

-- First request ever for this bucket: start full, as if it's been idle.
if tokens == nil then
  tokens = capacity
  updated_at_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - updated_at_ms)
tokens = math.min(capacity, tokens + (elapsed_ms / 1000) * refill_per_sec)

local allowed = 0
local retry_after_ms = 0

if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  local deficit = requested - tokens
  retry_after_ms = math.ceil((deficit / refill_per_sec) * 1000)
end

redis.call("HSET", key, "tokens", tostring(tokens), "updated_at_ms", tostring(now_ms))

-- Let an idle bucket expire instead of living forever: enough time to fully
-- refill from empty, plus slack, so a caller that stops sending requests
-- doesn't leave a Redis key allocated indefinitely.
local ttl_sec = math.ceil(capacity / refill_per_sec) + 60
redis.call("EXPIRE", key, ttl_sec)

return { allowed, tostring(tokens), retry_after_ms }
