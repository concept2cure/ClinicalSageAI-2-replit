import jwt from 'jsonwebtoken';

export function getEmbedUrl(params = {}) {
  const payload = {
    resource: { dashboard: parseInt(process.env.MB_DASHBOARD_ID, 10) },
    params,
    exp: Math.round(Date.now() / 1000) + 60 * 10, // 10‑min TTL
  };
  const token = jwt.sign(payload, process.env.MB_SECRET_KEY);
  return `${process.env.MB_SITE_URL}/embed/dashboard/${token}#bordered=false&titled=true`;
}
