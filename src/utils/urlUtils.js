// src/utils/urlUtils.js
const { nanoid } = require('nanoid');
const QRCode = require('qrcode');

// Generate short code (simplified)
const generateShortCode = (length = 8) => {
  return nanoid(length);
};

// Validate URL format
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Generate QR code for URL
const generateQRCode = async (url) => {
  try {
    const qrCode = await QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCode;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

module.exports = {
  generateShortCode,
  isValidUrl,
  generateQRCode
};