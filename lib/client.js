(function () {
	window.__ModuleLoader__.load({
		id: "dsh-sidebar-bookmarks",
		factory: (require) => {
			const React = require("react");
			const h = React.createElement;

			const TYPE_ID = "dsh-sidebar-bookmarks";
			const KIND = "bookmarks";

			// 书签存 cookie：cookie 按主机名（127.0.0.1）作用，不随端口变化，
			// 因此 DSH 每次重启换端口也不会丢；整份 JSON 分片写入。
			const COOKIE_PREFIX = "dsh_bm_";
			const COOKIE_CHUNK = 2500;
			const COOKIE_MAX = 30;

			const inputStyle = {
				width: "100%",
				boxSizing: "border-box",
				padding: "6px 8px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))",
				background: "var(--dsw-alias-bg-primary, transparent)",
				color: "var(--dsw-alias-label-primary, inherit)",
				fontSize: "12px",
				outline: "none"
			};
			const primaryButton = {
				padding: "6px 10px",
				borderRadius: "6px",
				border: "none",
				cursor: "pointer",
				background: "var(--dsw-alias-brand-primary, #4d6bfe)",
				color: "#fff",
				fontSize: "12px"
			};

			function readCookieMap() {
				const map = new Map();
				const raw = typeof document === "undefined" ? "" : document.cookie || "";
				for (const item of raw.split("; ")) {
					if (!item) continue;
					const at = item.indexOf("=");
					if (at < 0) continue;
					map.set(item.slice(0, at), item.slice(at + 1));
				}
				return map;
			}

			const LS_KEY = "dsh-sidebar-bookmarks:v1";

			function loadCookies() {
				try {
					const map = readCookieMap();
					const parts = [];
					for (let i = 0; i < COOKIE_MAX; i += 1) {
						const value = map.get(COOKIE_PREFIX + i);
						if (value === undefined || value === "") break;
						parts.push(value);
					}
					if (parts.length === 0) return [];
					const data = JSON.parse(decodeURIComponent(parts.join("")));
					return Array.isArray(data) ? data : [];
				} catch {
					return [];
				}
			}

			function loadBookmarks() {
				try {
					const raw = window.localStorage.getItem(LS_KEY);
					if (raw) {
						const data = JSON.parse(raw);
						if (Array.isArray(data) && data.length > 0) return data;
					}
				} catch {}
				const fromCookie = loadCookies();
				if (fromCookie.length > 0) {
					try { window.localStorage.setItem(LS_KEY, JSON.stringify(fromCookie)); } catch {}
				}
				return fromCookie;
			}

			function saveCookies(list) {
				const raw = encodeURIComponent(JSON.stringify(list));
				if (raw.length > COOKIE_MAX * COOKIE_CHUNK) return;
				const chunks = [];
				for (let i = 0; i < raw.length; i += COOKIE_CHUNK) {
					chunks.push(raw.slice(i, i + COOKIE_CHUNK));
				}
				if (chunks.length === 0) chunks.push("");
				for (let i = 0; i < COOKIE_MAX; i += 1) {
					document.cookie = COOKIE_PREFIX + i + "=; path=/; max-age=0; SameSite=Lax";
				}
				chunks.forEach((chunk, index) => {
					document.cookie = COOKIE_PREFIX + index + "=" + chunk + "; path=/; max-age=31536000; SameSite=Lax";
				});
			}

			function saveBookmarks(list) {
				let stored = false;
				try {
					window.localStorage.setItem(LS_KEY, JSON.stringify(list));
					stored = true;
				} catch {}
				try { saveCookies(list); } catch {}
				if (!stored && document.cookie.indexOf(COOKIE_PREFIX + "0=") < 0) {
					throw new Error("浏览器禁用了本地存储，书签无法保存");
				}
			}

			/** 右侧栏 tab 的正文；props.useTabInfo() 提供当前 tab 的会话级 actions。 */
			function Body(props) {
				const [items, setItems] = React.useState(loadBookmarks);
				const [error, setError] = React.useState("");
				const [title, setTitle] = React.useState("");
				const [url, setUrl] = React.useState("");

				const info = typeof props?.useTabInfo === "function" ? props.useTabInfo() : undefined;
				const tab = info?.tab;

				const persist = (next) => {
					setError("");
					try {
						saveBookmarks(next);
						setItems(next);
					} catch (cause) {
						setError(String(cause?.message ?? cause));
					}
				};

				const add = () => {
					let raw = url.trim();
					if (!raw) { setError("请输入网址"); return; }
					if (!/^[a-z]+:\/\//i.test(raw)) raw = "https://" + raw;
					let parsed;
					try { parsed = new URL(raw); } catch { setError("网址格式不正确"); return; }
					if (parsed.protocol !== "http:" && parsed.protocol !== "https:") { setError("只支持 http/https 网址"); return; }
					const label = title.trim() || parsed.hostname;
					const next = [{
						id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
						title: label,
						url: raw,
						addedAt: Date.now()
					}, ...items];
					setTitle("");
					setUrl("");
					persist(next);
				};

				const remove = (id) => persist(items.filter((item) => item.id !== id));

				const open = (u) => {
					try {
						if (!tab || !tab.actions || typeof tab.actions.openTab !== "function") {
							throw new Error("当前 tab 没有可用的会话导航接口");
						}
						tab.actions.openTab("browser", { params: { url: u } });
					} catch (cause) {
						setError(String(cause?.message ?? cause));
					}
				};

				return h("div", {
					style: {
						display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
						padding: "12px", gap: "8px", boxSizing: "border-box",
						fontSize: "13px", color: "var(--dsw-alias-label-primary, inherit)"
					}
				},
					h("div", { style: { fontSize: "14px", fontWeight: 600 } }, "书签"),
					h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
						h("input", {
							style: inputStyle, value: title, placeholder: "标题（可选）",
							onChange: (event) => setTitle(event.target.value)
						}),
						h("input", {
							style: inputStyle, value: url, placeholder: "https://example.com",
							onChange: (event) => setUrl(event.target.value),
							onKeyDown: (event) => { if (event.key === "Enter") add(); }
						}),
						h("button", { style: primaryButton, onClick: add }, "添加到书签")
					),
					error ? h("div", { style: { color: "#e5484d", fontSize: "12px" } }, error) : null,
					h("div", {
						style: {
							flex: 1, minHeight: 0, overflow: "auto", display: "flex",
							flexDirection: "column", gap: "6px", paddingTop: "4px"
						}
					},
						items.length === 0 ? h("div", { style: { opacity: 0.6 } }, "还没有书签，添加第一个吧")
							: items.map((item) => h("div", {
								key: item.id,
								style: {
									display: "flex", alignItems: "center", gap: "8px",
									padding: "6px 8px", borderRadius: "6px",
									background: "var(--dsw-alias-bg-secondary, rgba(127,127,127,.08))"
								}
							},
								h("div", {
									style: { flex: 1, minWidth: 0, cursor: "pointer" },
									onClick: () => open(item.url),
									title: item.url
								},
									h("div", {
										style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
									}, item.title || item.url),
									h("div", {
										style: {
											fontSize: "11px", opacity: 0.6, overflow: "hidden",
											textOverflow: "ellipsis", whiteSpace: "nowrap"
										}
									}, item.url)
								),
								h("button", {
									style: {
										background: "transparent", border: "none", cursor: "pointer",
										color: "var(--dsw-alias-label-secondary, inherit)", padding: "4px 6px", fontSize: "12px"
									},
									title: "删除",
									onClick: () => remove(item.id)
								}, "✕")
							))
					)
				);
			}

			const inject = ["slots", "sidebarRightTabs"];

			const apply = (ctx) => {
				ctx.effect(() => ctx.sidebarRightTabs.register({
					id: TYPE_ID,
					kind: KIND,
					title: () => "书签",
					guide: [{
						id: "bookmarks",
						title: () => "书签",
						description: () => "收藏的网址，点击在侧边浏览器打开",
						order: 20
					}]
				}));
				ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
					name: "sidebar.right.pane.tab",
					key: TYPE_ID
				}, Body));
			};

			return { name: "sidebar-bookmarks", inject, apply };
		}
	});
})();
