import fs from 'node:fs';
import path from 'node:path';

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source directory ${src} does not exist. Skipping.`);
    return;
  }
  
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = process.cwd();
const standaloneDir = path.join(root, '.next', 'standalone');

if (fs.existsSync(standaloneDir)) {
  console.log(`Detected standalone output at ${standaloneDir}. Copying assets...`);
  
  const publicDest = path.join(standaloneDir, 'public');
  const staticDest = path.join(standaloneDir, '.next', 'static');
  
  console.log(`Copying public folder to ${publicDest}...`);
  copyDir(path.join(root, 'public'), publicDest);
  
  console.log(`Copying .next/static to ${staticDest}...`);
  copyDir(path.join(root, '.next', 'static'), staticDest);
  
  console.log('Successfully copied assets to standalone directory.');
} else {
  console.warn('Could not find .next/standalone directory. Ensure output: "standalone" is in your next.config.js and you just ran next build.');
}
