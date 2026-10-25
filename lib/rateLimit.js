'use strict';

const buckets = new Map();
const cooldowns = new Map();
const violations = new Map();
const blocked = new Map();

const HOUR_MS = 60 * 60 * 1000;

function consume(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfter: 0 };
}

function setCooldown(key, durationMs) {
  cooldowns.set(key, Date.now() + durationMs);
}

function getCooldown(key) {
  const until = cooldowns.get(key);
  if (!until) return 0;

  const remaining = until - Date.now();
  if (remaining <= 0) {
    cooldowns.delete(key);
    return 0;
  }

  return Math.ceil(remaining / 1000);
}

function clearCooldown(key) {
  cooldowns.delete(key);
}

function block(ipHash, durationMs = HOUR_MS) {
  blocked.set(ipHash, Date.now() + durationMs);
}

function isBlocked(ipHash) {
  const until = blocked.get(ipHash);
  if (!until) return false;

  if (until <= Date.now()) {
    blocked.delete(ipHash);
    return false;
  }

  return true;
}

function addViolation(ipHash) {
  const now = Date.now();
  let record = violations.get(ipHash);

  if (!record || record.resetAt <= now) {
    record = { count: 0, resetAt: now + HOUR_MS };
  }

  record.count += 1;
  violations.set(ipHash, record);

  if (record.count >= 3) {
    violations.delete(ipHash);
    block(ipHash, HOUR_MS);
    return { blocked: true, count: record.count };
  }

  return { blocked: false, count: record.count };
}

function cleanup() {
  const now = Date.now();

  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }

  for (const [key, until] of cooldowns) {
    if (until <= now) cooldowns.delete(key);
  }

  for (const [key, value] of violations) {
    if (value.resetAt <= now) violations.delete(key);
  }

  for (const [key, until] of blocked) {
    if (until <= now) blocked.delete(key);
  }
}

const timer = setInterval(cleanup, 5 * 60 * 1000);
if (typeof timer.unref === 'function') timer.unref();

module.exports = {
  consume,
  setCooldown,
  getCooldown,
  clearCooldown,
  block,
  isBlocked,
  addViolation,
  cleanup
};
