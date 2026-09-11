import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve('dist');

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Copy homepage to dist/index.html
const homepagePath = path.resolve('Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html');
if (fs.existsSync(homepagePath)) {
  const content = fs.readFileSync(homepagePath, 'utf-8');
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), content);
  fs.writeFileSync(path.resolve('index.html'), content);
}

// Copy logo svg
const logoPath = path.resolve('Stitch/stitch_eyekart_optical_commerce_platform/eyekart_brand_logo/code.html');
if (fs.existsSync(logoPath)) {
  const logoContent = fs.readFileSync(logoPath, 'utf-8');
  fs.writeFileSync(path.join(DIST_DIR, 'logo.svg'), logoContent);
  if (!fs.existsSync(path.resolve('public'))) {
    fs.mkdirSync(path.resolve('public'), { recursive: true });
  }
  fs.writeFileSync(path.resolve('public/logo.svg'), logoContent);
}

console.log('[Build] EyeKart production build completed successfully.');
