// 로컬 미리보기 전용 서버. 정적 파일을 서빙하고, /api/thumb 요청은
// api/thumb.js의 Vercel 서버리스 핸들러를 그대로 불러와 실행한다.
// 실제 배포(Vercel)에서는 이 파일이 필요 없고 /api 폴더를 자동으로 인식한다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const thumbHandler = (await import("../api/thumb.js")).default;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function makeRes(nodeRes) {
  return {
    _status: 200,
    status(code) {
      this._status = code;
      return this;
    },
    setHeader(k, v) {
      nodeRes.setHeader(k, v);
    },
    send(body) {
      nodeRes.statusCode = this._status;
      nodeRes.end(body);
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/thumb") {
    const reqLike = { query: Object.fromEntries(url.searchParams) };
    await thumbHandler(reqLike, makeRes(res));
    return;
  }

  let filePath = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
  try {
    const buf = await readFile(filePath);
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

const PORT = 5501;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
