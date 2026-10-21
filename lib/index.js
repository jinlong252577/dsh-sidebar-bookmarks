import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 诊断里显示的插件名。 */
export const name = "sidebar-bookmarks";

/** 没有必需服务；webServer 用 ctx.get 读取，缺失时安静降级。 */
export const inject = [];

const ROUTE_LIST = "/sidebar-bookmarks/api/list";
const ROUTE_SAVE = "/sidebar-bookmarks/api/save";
const STORE_DIR = path.join(os.homedir(), ".dsh");
const STORE_FILE = path.join(STORE_DIR, "sidebar-bookmarks.json");
const MAX_BODY = 1024 * 1024;

function isLocalRequest(req) {
	const host = String(req.headers.host || "");
	return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
}

function sendJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(text),
		"Cache-Control": "no-store"
	});
	res.end(text);
}

function readBookmarks() {
	try {
		const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}

function writeBookmarks(list) {
	fs.mkdirSync(STORE_DIR, { recursive: true });
	const tmp = STORE_FILE + ".tmp";
	fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
	fs.renameSync(tmp, STORE_FILE);
}

/** 只保留结构正确的条目，并把长度压到安全范围。 */
function sanitize(list) {
	return list.slice(0, 500).map((item) => ({
		id: String(item?.id ?? "").slice(0, 80),
		title: String(item?.title ?? "").slice(0, 200),
		url: String(item?.url ?? "").slice(0, 2000),
		addedAt: Number(item?.addedAt) || Date.now()
	})).filter((item) => /^https?:\/\//i.test(item.url));
}

export function apply(ctx) {
	const webServer = ctx.webServer ?? (typeof ctx.get === "function" ? ctx.get("webServer") : undefined);
	try {
		fs.appendFileSync(
			path.join(STORE_DIR, "sidebar-bookmarks-boot.log"),
			`${new Date().toISOString()} webServer=${Boolean(webServer)}\n`
		);
	} catch {}
	if (!webServer) {
		ctx.logger?.info?.("[sidebar-bookmarks] 当前 profile 没有 webServer，书签面板不可用");
		return;
	}

	ctx.effect(() => webServer.register({
		kind: "exact",
		path: ROUTE_LIST,
		handler: (req, res) => {
			if (!isLocalRequest(req)) return sendJson(res, 403, { error: "forbidden" });
			if (req.method !== "GET") return sendJson(res, 405, { error: "method" });
			sendJson(res, 200, { bookmarks: readBookmarks() });
		}
	}));

	ctx.effect(() => webServer.register({
		kind: "exact",
		path: ROUTE_SAVE,
		handler: (req, res) => {
			if (!isLocalRequest(req)) return sendJson(res, 403, { error: "forbidden" });

			const apply = (text) => {
				try {
					const parsed = JSON.parse(text);
					if (!Array.isArray(parsed)) throw new Error("expected an array");
					writeBookmarks(sanitize(parsed));
					sendJson(res, 200, { ok: true });
				} catch (error) {
					sendJson(res, 400, { error: String(error?.message ?? error) });
				}
			};

			// GET 保存：DSH 的 web 网关对插件路由的 POST 会返回 405，
			// 因此把整份书签放进 query 里提交（个人书签量足够小）。
			if (req.method === "GET") {
				const url = new URL(req.url ?? "", "http://localhost");
				apply(url.searchParams.get("data") ?? "[]");
				return;
			}

			if (req.method !== "POST") return sendJson(res, 405, { error: "method" });

			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
				if (body.length > MAX_BODY) {
					req.destroy();
				}
			});
			req.on("end", () => apply(body));
		}
	}));

	ctx.logger?.info?.("[sidebar-bookmarks] 已就绪：" + STORE_FILE);
}
