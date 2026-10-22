import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../public/gameshub-logo.svg", import.meta.url));
for (const [name, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["favicon-32.png", 32],
]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
}
