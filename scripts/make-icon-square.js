/**
 * Convierte assets/icon.png en cuadrado (Expo requiere icono cuadrado).
 * Crea assets/icon-square.png. Sustituye icon.png por ese archivo y borra icon-square.png.
 * Ejecutar: node scripts/make-icon-square.js
 */
const path = require('path');
const fs = require('fs');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Instala sharp: npm install --save-dev sharp');
    process.exit(1);
  }

  const inputPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const outputPath = path.join(__dirname, '..', 'assets', 'icon-square.png');

  if (!fs.existsSync(inputPath)) {
    console.error('No existe assets/icon.png');
    process.exit(1);
  }

  const image = sharp(inputPath);
  const { width, height } = await image.metadata();
  const size = Math.max(width, height, 1024);
  const top = Math.floor((size - height) / 2);
  const bottom = size - height - top;
  const left = Math.floor((size - width) / 2);
  const right = size - width - left;

  await image
    .extend({ top, bottom, left, right, background: { r: 0, g: 26, b: 51, alpha: 0 } })
    .png()
    .toFile(outputPath);

  const backupPath = path.join(__dirname, '..', 'assets', 'icon.png.bak');
  fs.renameSync(inputPath, backupPath);
  fs.renameSync(outputPath, inputPath);
  console.log('Icono actualizado: assets/icon.png es ahora', size, 'x', size, '(copia de seguridad en icon.png.bak).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
