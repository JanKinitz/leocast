/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Kennung der Version: bei jedem Push neu, damit Geräte Aktualisierungen erkennen
  env: { NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12) },
  devIndicators: false,
  images: {
    // Cover kommen von vielen Podcast-Servern und von Spotify
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
