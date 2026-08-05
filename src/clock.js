/*!
 * same-second · clock.js
 * 进度钟：整套「一起听」机制的地基。
 * 不传音频、不轮询、不依赖网络——只维护一个时间戳。
 * PolyForm Noncommercial 1.0.0
 */
'use strict';

const DEFAULT_OFFSET_MS = 2000;   // 切 app 去按播放的固定成本，实测约 2s

/** 开一场「一起听」。track 为 iTunes 元数据。 */
function arm(track, startedAt = Date.now()) {
  return {
    trackId: String(track.id), title: track.title, artist: track.artist,
    duration: track.duration, cover: track.cover,
    startedAt, offsetMs: DEFAULT_OFFSET_MS, playCount: track.playCount || 1
  };
}

/** 任何时刻的进度（ms），纯本地计算。 */
function progress(session, now = Date.now()) {
  if (!session || !session.startedAt) return 0;
  const p = now - session.startedAt + (session.offsetMs || 0);
  return Math.max(0, Math.min(p, session.duration));
}

/** 这一场是否已经放完。 */
function isOver(session, now = Date.now()) {
  return progress(session, now) >= session.duration;
}

/** 手动校准。deltaMs 取 ±1000 / ±5000。 */
function calibrate(session, deltaMs) {
  return Object.assign({}, session, { offsetMs: (session.offsetMs || 0) + deltaMs });
}

/** mm:ss */
function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** 定位当前唱到第几句（二分）。 */
function currentLine(lines, ms) {
  if (!Array.isArray(lines) || !lines.length) return { index: -1, line: null };
  let lo = 0, hi = lines.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].ms <= ms) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return { index: idx, line: lines[idx] };
}

/** 注入上下文的「此刻」块。只给当前句和前后各一句。 */
function nowPlayingBlock(session, lines, now = Date.now()) {
  const ms = progress(session, now);
  const r = currentLine(lines, ms);
  const out = [
    '[正在一起听] ' + session.title + ' — ' + session.artist,
    '[进度] ' + fmt(ms) + ' / ' + fmt(session.duration) +
      '（第 ' + session.playCount + ' 次听这首）'
  ];
  if (r.line) {
    const say = (l) => l ? l.text + (l.zh ? ' / ' + l.zh : '') : null;
    const prev = say(lines[r.index - 1]), next = say(lines[r.index + 1]);
    if (prev) out.push('[上一句] ' + prev);
    out.push('[此刻唱到] ' + say(r.line));
    if (next) out.push('[下一句] ' + next);
  }
  return out.join('\n');
}

/** 解析标准 LRC 为 [{ms,text}]，已排序。 */
function parseLrc(lrc) {
  if (!lrc) return [];
  const out = [];
  for (const raw of String(lrc).split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) continue;
    for (const t of tags) {
      const frac = t[3] ? Number('0.' + t[3]) * 1000 : 0;
      out.push({ ms: (+t[1] * 60 + +t[2]) * 1000 + frac, text });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

module.exports = { DEFAULT_OFFSET_MS, arm, progress, isOver, calibrate, fmt,
                   currentLine, nowPlayingBlock, parseLrc };
