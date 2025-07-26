const Url = require('../models/Url');
const { nanoid } = require('nanoid');
const { BASE_URL } = process.env;

// Helper to check if a URL is expired
function isExpired(urlDoc) {
  return urlDoc.expiresAt && urlDoc.expiresAt < new Date();
}

exports.createShortUrl = async (req, res) => {
  const { originalUrl, customAlias, expiresAt } = req.body;
  if (!originalUrl) return res.status(400).json({ error: 'Original URL is required.' });

  let shortCode;
  if (customAlias) {
    // Check if custom alias is taken
    const exists = await Url.findOne({ customAlias });
    if (exists) return res.status(409).json({ error: 'Custom alias already in use.' });
    shortCode = customAlias;
  } else {
    shortCode = nanoid(7);
    // Ensure uniqueness
    while (await Url.findOne({ shortCode })) {
      shortCode = nanoid(7);
    }
  }

  const urlDoc = new Url({
    originalUrl,
    shortCode,
    customAlias: customAlias || undefined,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined
  });
  await urlDoc.save();
  res.json({ shortUrl: `${BASE_URL || req.headers.host}/${shortCode}` });
};

exports.redirectUrl = async (req, res) => {
  const { code } = req.params;
  const urlDoc = await Url.findOne({ $or: [{ shortCode: code }, { customAlias: code }] });
  if (!urlDoc) return res.status(404).json({ error: 'URL not found.' });
  if (isExpired(urlDoc)) return res.status(410).json({ error: 'URL has expired.' });
  urlDoc.clicks += 1;
  await urlDoc.save();
  res.redirect(urlDoc.originalUrl);
};

exports.getAnalytics = async (req, res) => {
  const { code } = req.params;
  const urlDoc = await Url.findOne({ $or: [{ shortCode: code }, { customAlias: code }] });
  if (!urlDoc) return res.status(404).json({ error: 'URL not found.' });
  res.json({ clicks: urlDoc.clicks, createdAt: urlDoc.createdAt, expiresAt: urlDoc.expiresAt });
};



