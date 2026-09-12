# 웹툰 모아보기 — 네이버웹툰 · 카카오웹툰 장르별 추천

네이버웹툰과 카카오웹툰의 인기 작품 목록을 장르별·요일별로 모아서 보여주는 사이트입니다. 검색과 즐겨찾기(이 브라우저 localStorage 기준) 기능도 있습니다.

## 어떻게 동작하나요

두 플랫폼 모두 공식 공개 API가 없어서, 각 사이트가 화면을 그릴 때 내부적으로 호출하는 JSON API를 그대로 사용합니다 (HTML을 긁는 방식이 아니라 이미 정리된 JSON을 받아오는 방식이라 비교적 안정적입니다).

```
webtoon-recommend/
├─ index.html, css/, js/     ← 정적 프론트엔드 (data/webtoons.json을 읽어서 렌더링)
├─ data/webtoons.json        ← 크롤러가 생성하는 결과 파일
├─ scripts/crawl.js          ← 네이버·카카오 API를 호출해 data/webtoons.json을 만드는 스크립트
├─ scripts/dev-server.js     ← 로컬 미리보기용 서버 (api/thumb.js 프록시 포함)
├─ api/thumb.js              ← 네이버 썸네일 핫링크 차단을 우회하는 최소 이미지 프록시 (Vercel 서버리스 함수)
└─ .github/workflows/crawl.yml  ← 6시간마다 자동으로 크롤러를 돌려서 데이터를 갱신하는 GitHub Actions
```

**매 요청마다 실시간으로 크롤링하지 않습니다.** GitHub Actions가 주기적으로(기본 6시간마다) 크롤러를 돌려 `data/webtoons.json`을 갱신하고 커밋하면, Vercel이 그 변경을 감지해 자동으로 재배포합니다. 웹사이트 자체는 이 JSON 파일만 읽는 순수 정적 사이트입니다.

## 로컬에서 실행하기

```bash
npm run crawl   # data/webtoons.json 생성/갱신
npm run dev     # http://localhost:5501 에서 미리보기 (이미지 프록시 포함)
```

## 배포하기 (Vercel)

1. GitHub에 새 저장소를 만들고 이 폴더를 push
2. [vercel.com](https://vercel.com) → GitHub 계정으로 로그인 → **Add New → Project** → 이 저장소 Import
3. Framework Preset은 **Other**로 두고 Deploy
4. 배포 후 **Settings → Deployment Protection**에서 "Vercel Authentication"이 꺼져 있는지 확인 (켜져 있으면 로그인한 본인만 접속 가능합니다)
5. GitHub Actions가 주기적으로 `data/webtoons.json`을 업데이트할 때마다 Vercel이 자동으로 재배포합니다

## 장르 구성

네이버웹툰과 카카오웹툰은 장르 분류 체계가 서로 달라서, `scripts/crawl.js`의 `GENRES` 배열에서 공통 장르 버킷을 정의하고 각 플랫폼의 세부 장르를 매핑해 합칩니다. 장르를 추가/변경하려면 이 배열만 수정하면 됩니다.

## 요일 구성

`scripts/crawl.js`의 `WEEKDAYS` 배열이 네이버 `titlelist/weekday`와 카카오 `timetables/days` API를 요일별로 호출해 그날 연재작 전체를 모읍니다. 화면에서는 "요일별" 탭을 눌러 전체/월/화/수/목/금/토/일로 볼 수 있습니다.

## 유의할 점

- 두 플랫폼 모두 공식 API가 아니므로, 사이트 개편으로 언제든 응답 형식이 바뀌어 크롤러가 깨질 수 있습니다. `scripts/crawl.js`를 실행했을 때 콘솔에 에러가 보이면 해당 API 경로나 응답 구조가 바뀐 것입니다.
- 썸네일 이미지는 저장하지 않고 원본 CDN에서 그때그때 불러옵니다 (네이버는 `/api/thumb` 프록시를 통해, 카카오는 직접).
- 개인/포트폴리오 목적을 넘어 트래픽이 커지거나 상업적으로 운영할 경우, 각 플랫폼 이용약관을 다시 검토하는 것을 권장합니다.
