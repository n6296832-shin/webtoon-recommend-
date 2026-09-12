// 네이버웹툰 / 카카오웹툰의 비공식 내부 JSON API를 주기적으로 호출해
// 장르별로 묶은 데이터를 data/webtoons.json 으로 저장하는 크롤러.
// 각 사이트가 화면을 그릴 때 실제로 호출하는 API를 그대로 사용하므로
// HTML 구조 변경에는 영향을 덜 받지만, API 자체가 바뀌면 이 파일을 손봐야 합니다.

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  Referer: "https://comic.naver.com/",
};

const KAKAO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  Referer: "https://webtoon.kakao.com/",
};

// 통합 장르: 두 플랫폼의 장르 체계가 서로 달라서, 하나의 화면에서 보여줄
// 공통 장르 버킷을 정의하고 각 플랫폼의 세부 장르를 여기에 매핑한다.
const GENRES = [
  { key: "romance", label: "로맨스", naver: ["PURE"], kakao: ["rank_romance"] },
  { key: "romance_fantasy", label: "로맨스판타지", naver: [], kakao: ["rank_romance_fantasy"] },
  { key: "fantasy", label: "판타지", naver: ["FANTASY"], kakao: ["rank_fantasy_drama", "rank_school_action_fantasy"] },
  { key: "action", label: "액션/무협", naver: ["ACTION", "HISTORICAL"], kakao: ["rank_action_wuxia"] },
  { key: "drama", label: "드라마", naver: ["DRAMA"], kakao: ["rank_drama"] },
  { key: "thriller", label: "스릴러/공포", naver: ["THRILL"], kakao: ["rank_horror_thriller"] },
  { key: "comic_daily", label: "개그/일상", naver: ["COMIC", "DAILY"], kakao: ["rank_comic_everyday_life"] },
  { key: "sports", label: "스포츠", naver: ["SPORTS"], kakao: [] },
  { key: "sensibility", label: "감성", naver: ["SENSIBILITY"], kakao: [] },
];

// 요일별 보기: 네이버·카카오 둘 다 요일 코드로 그날 연재작 전체를 한 번에 내려주는
// API가 따로 있어서, 장르용 랭킹 API와는 별도로 호출한다.
const WEEKDAYS = [
  { key: "mon", label: "월", naver: "mon", kakao: "timetable_mon" },
  { key: "tue", label: "화", naver: "tue", kakao: "timetable_tue" },
  { key: "wed", label: "수", naver: "wed", kakao: "timetable_wed" },
  { key: "thu", label: "목", naver: "thu", kakao: "timetable_thu" },
  { key: "fri", label: "금", naver: "fri", kakao: "timetable_fri" },
  { key: "sat", label: "토", naver: "sat", kakao: "timetable_sat" },
  { key: "sun", label: "일", naver: "sun", kakao: "timetable_sun" },
];

const NAVER_PAGES_PER_GENRE = 2; // 장르 코드 1개당 최대 페이지 수 (25개/페이지)
const KAKAO_ITEMS_PER_PLACEMENT = 30; // 카카오 랭킹 플레이스먼트 1개당 최대 아이템 수
const KAKAO_ITEMS_PER_DAY = 60; // 카카오 요일별 연재작 최대 아이템 수

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchNaverGenrePage(genreCode, page) {
  const url = `https://comic.naver.com/api/webtoon/titlelist/genre?genre=${genreCode}&page=${page}`;
  const res = await fetch(url, { headers: NAVER_HEADERS });
  if (!res.ok) throw new Error(`Naver ${genreCode} p${page} -> ${res.status}`);
  return res.json();
}

async function fetchNaverGenre(genreCode) {
  const items = [];
  for (let page = 1; page <= NAVER_PAGES_PER_GENRE; page++) {
    const data = await fetchNaverGenrePage(genreCode, page);
    for (const t of data.titleList ?? []) {
      if (t.adult) continue; // 19세 이상 작품 제외
      items.push({
        platform: "naver",
        id: String(t.titleId),
        title: t.titleName,
        author: t.author,
        // 네이버 CDN은 Referer가 comic.naver.com이 아니면 403을 내려서, 우리 서버의
        // /api/thumb 프록시를 거치도록 한다 (이미지 자체는 저장하지 않고 중계만 함).
        thumbnail: `/api/thumb?u=${encodeURIComponent(t.thumbnailUrl)}`,
        synopsis: null,
        rating: t.starScore ?? null,
        finished: !!t.finish,
        url: `https://comic.naver.com/webtoon/list?titleId=${t.titleId}`,
      });
    }
    if (page >= (data.pageInfo?.totalPages ?? 1)) break;
    await sleep(200); // 과도한 요청 방지
  }
  return items;
}

function kakaoCardToItem(c) {
  return {
    platform: "kakao",
    id: String(c.id),
    title: c.title,
    author: (c.authors ?? []).map((a) => a.name).join(", "),
    // 카카오 CDN은 확장자를 안 붙이면 404를 내려서 .webp를 붙여준다.
    thumbnail: c.titleImageA ? `${c.titleImageA}.webp` : c.backgroundImage ? `${c.backgroundImage}.jpg` : null,
    synopsis: c.synopsis ?? null,
    rating: null,
    finished: c.onGoingStatus === "COMPLETED",
    url: `https://webtoon.kakao.com/content/${encodeURIComponent(c.seoId)}/${c.id}`,
  };
}

async function fetchKakaoSections(url, limit) {
  const res = await fetch(url, { headers: KAKAO_HEADERS });
  if (!res.ok) throw new Error(`Kakao ${url} -> ${res.status}`);
  const data = await res.json();
  const items = [];
  for (const section of data.data ?? []) {
    for (const group of section.cardGroups ?? []) {
      for (const card of group.cards ?? []) {
        if (!card.content) continue;
        if (card.content.adult) continue; // 19세 이상 작품 제외
        items.push(kakaoCardToItem(card.content));
        if (items.length >= limit) return items;
      }
    }
  }
  return items;
}

function fetchKakaoPlacement(placement, limit = KAKAO_ITEMS_PER_PLACEMENT) {
  return fetchKakaoSections(`https://gateway-kw.kakao.com/section/v4/sections?placement=${placement}`, limit);
}

function fetchKakaoWeekday(placement, limit = KAKAO_ITEMS_PER_DAY) {
  return fetchKakaoSections(
    `https://gateway-kw.kakao.com/section/v2/timetables/days?placement=${placement}`,
    limit
  );
}

async function fetchNaverWeekday(dayCode) {
  const url = `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${dayCode}`;
  const res = await fetch(url, { headers: NAVER_HEADERS });
  if (!res.ok) throw new Error(`Naver weekday ${dayCode} -> ${res.status}`);
  const data = await res.json();
  return (data.titleList ?? [])
    .filter((t) => !t.adult) // 19세 이상 작품 제외
    .map((t) => ({
      platform: "naver",
      id: String(t.titleId),
      title: t.titleName,
      author: t.author,
      thumbnail: `/api/thumb?u=${encodeURIComponent(t.thumbnailUrl)}`,
      synopsis: null,
      rating: t.starScore ?? null,
      finished: !!t.finish,
      url: `https://comic.naver.com/webtoon/list?titleId=${t.titleId}`,
    }));
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.platform}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function buildGenre(genre) {
  const items = [];

  for (const code of genre.naver) {
    try {
      items.push(...(await fetchNaverGenre(code)));
    } catch (err) {
      console.error(`[naver:${genre.key}:${code}]`, err.message);
    }
    await sleep(200);
  }

  for (const placement of genre.kakao) {
    try {
      items.push(...(await fetchKakaoPlacement(placement)));
    } catch (err) {
      console.error(`[kakao:${genre.key}:${placement}]`, err.message);
    }
    await sleep(200);
  }

  return { key: genre.key, label: genre.label, items: dedupe(items) };
}

async function buildWeekday(day) {
  const items = [];

  try {
    items.push(...(await fetchNaverWeekday(day.naver)));
  } catch (err) {
    console.error(`[naver:weekday:${day.key}]`, err.message);
  }
  await sleep(200);

  try {
    items.push(...(await fetchKakaoWeekday(day.kakao)));
  } catch (err) {
    console.error(`[kakao:weekday:${day.key}]`, err.message);
  }
  await sleep(200);

  return { key: day.key, label: day.label, items: dedupe(items) };
}

async function main() {
  const genres = [];
  for (const genre of GENRES) {
    console.log(`크롤링 중 (장르): ${genre.label}`);
    genres.push(await buildGenre(genre));
  }

  const weekdays = [];
  for (const day of WEEKDAYS) {
    console.log(`크롤링 중 (요일): ${day.label}`);
    weekdays.push(await buildWeekday(day));
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    genres,
    weekdays,
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir(new URL("../data", import.meta.url), { recursive: true });
  await fs.writeFile(
    new URL("../data/webtoons.json", import.meta.url),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  const genreTotal = genres.reduce((n, g) => n + g.items.length, 0);
  const weekdayTotal = weekdays.reduce((n, g) => n + g.items.length, 0);
  console.log(
    `완료: 장르 ${genres.length}개(${genreTotal}개 작품), 요일 ${weekdays.length}개(${weekdayTotal}개 작품)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
