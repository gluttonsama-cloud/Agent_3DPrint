const express = require('express');
const { removePortraitBackground } = require('../services/portraitBackground');

module.exports = function createPortraitBackgroundRouter(remove = removePortraitBackground, options = {}) {
  const router = express.Router();
  const normalize = ip => (ip || '').replace(/^::ffff:/, '');
  const allowedIps = new Set(['127.0.0.1', '::1', ...(options.allowedIps
    ?? (process.env.PREPROCESS_ALLOWED_IPS || '').split(',').map(ip => ip.trim()))].map(normalize));
  const allowedOrigins = new Set((process.env.PREPROCESS_ALLOWED_ORIGINS || '')
    .split(',').map(origin => origin.trim()).filter(Boolean));
  const windows = new Map();
  let active = 0;
  let globalWindow = { start: Date.now(), count: 0 };
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // 默认只接受本机连接，不信任客户端提供的 X-Forwarded-For。
    const ip = normalize(req.socket.remoteAddress);
    const origin = req.get('origin');
    let trustedOrigin = !origin || allowedOrigins.has(origin);
    if (origin && !trustedOrigin) {
      try {
        const url = new URL(origin);
        trustedOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          && ['http:', 'https:', 'capacitor:'].includes(url.protocol);
      } catch { trustedOrigin = false; }
    }
    if (!allowedIps.has(ip) || !trustedOrigin) {
      return res.status(403).json({ success: false, error: 'ACCESS_DENIED',
        message: '当前连接未获准使用云端抠图，请联系服务管理员' });
    }
    const now = Date.now();
    for (const [key, value] of windows) {
      if (now - value.start >= 600000) windows.delete(key);
    }
    if (now - globalWindow.start >= 3600000) globalWindow = { start: now, count: 0 };
    const window = windows.get(ip) || { start: now, count: 0 };
    if (active >= (options.concurrency ?? 2)
      || window.count >= (options.perIpLimit ?? 20) || globalWindow.count >= 60) {
      return res.status(429).set('Retry-After', '60').json({ success: false,
        error: 'RATE_LIMITED', message: '抠图请求过于频繁或正在排队，请稍后重试' });
    }
    window.count++;
    globalWindow.count++;
    windows.set(ip, window);
    active++;
    try {
      const image = await remove(req.body?.image);
      res.json({ success: true, image });
    } catch (error) {
      res.status(error.status || 500).json({ success: false,
        error: 'BACKGROUND_REMOVAL_ERROR',
        message: error.status ? error.message : '抠图失败，请稍后重试' });
    } finally {
      active--;
    }
  });
  return router;
};
