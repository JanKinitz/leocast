// Podcast-Cover sind oft 3000 × 3000 Pixel groß. Vercel verkleinert sie passend (Next.js-Bildoptimierung).
// Erlaubte Breiten: 128, 256, 384 (imageSizes) und 640, 828 (deviceSizes).

export function img(url: string | undefined, width: 128 | 256 | 384 | 640 | 828): string | undefined {
  if (!url) return undefined;
  if (!/^https:\/\//i.test(url)) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}
