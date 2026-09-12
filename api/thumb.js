// 네이버웹툰 썸네일은 Referer가 comic.naver.com이 아니면 403을 반환한다(핫링크 차단).
// 이미지를 우리 쪽에 복사/저장하지 않고, 요청이 올 때마다 올바른 Referer를 붙여
// 원본에서 그대로 가져와 중계만 하는 최소 프록시.
const ALLOWED_HOSTS = new Set(["image-comic.pstatic.net"]);

export default async function handler(req, res) {
  const raw = req.query.u;
  if (!raw) {
    res.status(400).send("missing u");
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).send("invalid url");
    return;
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    res.status(403).send("host not allowed");
    return;
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      Referer: "https://comic.naver.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  if (!upstream.ok) {
    res.status(upstream.status).send("upstream error");
    return;
  }

  res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(200).send(buf);
}
