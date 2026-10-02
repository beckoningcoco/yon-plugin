window.__ModuleLoader__.load({
	id: "dsh-plugin-yon-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/panel-store.ts
		/**
		* Create the panel state source. One handle per `apply` call: the source
		* identity stays stable (the renderer caches the hook binding per source) and
		* its snapshot reference changes only when the state actually moves.
		* @returns the panel store.
		*/
		function createYonPanelStore() {
			let snapshot = {
				open: false,
				overlayDepth: 0
			};
			let overlayDepth = 0;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (open) => {
				if (snapshot.open === open && snapshot.overlayDepth === overlayDepth) return;
				snapshot = {
					open,
					overlayDepth
				};
				for (const listener of [...listeners]) listener();
			};
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				open: () => {
					publish(true);
				},
				close: () => {
					publish(false);
				},
				toggle: () => {
					publish(!snapshot.open);
				},
				pushOverlay: () => {
					overlayDepth += 1;
					publish(snapshot.open);
					let released = false;
					return () => {
						if (released) return;
						released = true;
						overlayDepth = Math.max(0, overlayDepth - 1);
						publish(snapshot.open);
					};
				}
			};
		}
		//#endregion
		//#region src/client/item-rows.ts
		/**
		* The panel's row projection: which entries occupy the button seat, in what
		* order, and what each is called.
		*
		* The panel renders its rows from this, not from whatever the entries happen to
		* draw. That inversion is the point: a list seat can be inspected, ordered and
		* named before any of its entries is mounted, which is what lets the panel label
		* a foreign entry without that package knowing the panel's copy, and what makes
		* "every button has a name" a property of the panel rather than a habit each
		* contributor has to keep.
		*
		* The names live on the registration (`label`, a string or a thunk resolved per
		* read) because that is where the harness already keeps the display label of a
		* list entry — the same field the conversation view projects its tabs from.
		*/
		/** The seat this projection reads. */
		const SEAT = "yon.panel.item";
		/**
		* Compare two row lists by what a reader would see: same ids in the same order,
		* under the same names. Rebuilding the array on every notification would be
		* invisible to React (it compares by snapshot reference), so returning the
		* previous array when nothing moved is what keeps a re-registration from
		* re-rendering the panel.
		* @param left - the current rows.
		* @param right - the candidate rows.
		* @returns whether the two are equivalent.
		*/
		function sameRows(left, right) {
			if (left.length !== right.length) return false;
			return left.every((row, index) => {
				const other = right[index];
				return other !== void 0 && row.id === other.id && row.label === other.label;
			});
		}
		/**
		* Build the panel's row projection over one apply world.
		* @param ctx - the two services the projection reads.
		* @returns the row source and its teardown.
		*/
		function createYonPanelItemRows(ctx) {
			let rows = [];
			const listeners = /* @__PURE__ */ new Set();
			const project = () => {
				const next = [];
				for (const entry of ctx.slots.entries(SEAT)) {
					const id = entry.options.id;
					if (id === void 0) continue;
					const declared = (0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(entry.options.label);
					next.push({
						id,
						label: declared === void 0 || declared === "" ? id : declared
					});
				}
				if (sameRows(next, rows)) return;
				rows = next;
				for (const listener of [...listeners]) listener();
			};
			const stopSlots = ctx.slots.subscribe(SEAT, project);
			const stopLocale = ctx.locale.subscribe(project);
			project();
			return {
				getSnapshot: () => rows,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				dispose: () => {
					stopSlots();
					stopLocale();
					listeners.clear();
				}
			};
		}
		//#endregion
		//#region src/shared/types.ts
		/** Every status, in display order (the client renders these as options). */
		const PROJECT_STATUSES = [
			"active",
			"paused",
			"done"
		];
		/** Every product, in display order (the client renders these as options). */
		const HOME_PRODUCTS = ["ncc", "bip"];
		/**
		* The versions the operator can pick, per product line.
		*
		* **The value is the bare version** (`2111`), while the label carries the product
		* family (`NCC2111`). That split is not cosmetic: the value is what the skills side
		* keys on, and the files on disk settle it — `ncc_home_path.json`'s human-authored
		* sibling `path_config.json` writes its keys as `NCC_Home_2111` / `BIP_Home_V5`, and
		* the skill directory holds `class_index_2111.json`, `class_index_2312.json`,
		* `class_index_BIP_V5.json`. A registration stored as `NCC2111` would make the
		* mirror write `index_file: class_index_NCC2111.json` — a name that matches nothing,
		* so the index it points at would read as never built.
		*
		* NCC's six are the versions the operator named; `NC65` is the older product line,
		* which is why its label is not `NCC65`. BIP gets its own list because the products
		* version differently — the BIP home on this machine is keyed `V5` (a
		* `class_index_BIP_V5.json` exists beside it), and the NCC list has no way to say
		* that. Neither list is closed: the form offers an "其他" escape so a version that
		* ships later (or one this file has not heard of) is still registrable, and the
		* service deliberately does not validate against this table — the mirror merges
		* versions the panel never registered, so a whitelist there would be a lie about
		* what the rest of the system tolerates.
		*/
		const HOME_VERSIONS = {
			ncc: [
				{
					value: "65",
					label: "NC65"
				},
				{
					value: "1909",
					label: "NCC1909"
				},
				{
					value: "2105",
					label: "NCC2105"
				},
				{
					value: "2111",
					label: "NCC2111"
				},
				{
					value: "2207",
					label: "NCC2207"
				},
				{
					value: "2312",
					label: "NCC2312"
				}
			],
			bip: [{
				value: "V5",
				label: "BIP V5"
			}]
		};
		/** Where the API lives, shared by the host's route table and the client's calls. */
		const API_PREFIX = "/yon/api";
		//#endregion
		//#region src/client/request.ts
		/**
		* The browser half's one way to talk to `/yon/api`.
		*
		* Both feature APIs (projects and skills) call through here, so a component
		* still never fetches, never subscribes, and never learns a URL — it receives
		* methods through an inject face, and the URL lives in exactly one place.
		*/
		/** One failed call, carrying the API's machine code. */
		var ApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "ApiError";
			}
		};
		/**
		* Perform one JSON call, turning a non-2xx answer into {@link ApiError}.
		* @param path - path after the API prefix (e.g. `/projects`).
		* @param init - fetch options; the JSON content type is added here.
		* @returns the parsed body.
		*/
		async function request(path, init = {}) {
			const response = await fetch(`${API_PREFIX}${path}`, {
				...init,
				headers: {
					"content-type": "application/json",
					...init.headers
				}
			});
			const text = await response.text();
			const body = text === "" ? void 0 : JSON.parse(text);
			if (!response.ok) {
				const failure = body ?? {};
				throw new ApiError(typeof failure.code === "string" ? failure.code : `http-${response.status}`, typeof failure.message === "string" && failure.message !== "" ? failure.message : `HTTP ${response.status}`);
			}
			return body;
		}
		//#endregion
		//#region src/client/datasource/api.ts
		/**
		* The datasource calls the UI drives: thin calls against `/yon/api/datasources`.
		*
		* It lives outside the components on purpose. The apply world builds one of
		* these and hands the methods to components through an inject face, so a
		* component never fetches, never subscribes, and never learns a URL.
		*
		* Every key travels URL-encoded: a key is `<configKey>::<env>` and the group
		* name is the operator's own text — Chinese, parentheses, spaces — so it is
		* never safe to paste into a path as-is.
		*/
		/** One key as a URL segment. */
		const keySegment = (key) => encodeURIComponent(key);
		/**
		* Build the API client.
		* @returns the operations the UI calls.
		*/
		function createDataSourceApi() {
			return {
				listDataSources() {
					return request("/datasources");
				},
				async saveDataSource(input) {
					const key = `${input.configKey}::${input.env}`;
					return (await request(`/datasources/${keySegment(key)}`, {
						method: "PUT",
						body: JSON.stringify(input)
					})).source;
				},
				async removeDataSource(key) {
					await request(`/datasources/${keySegment(key)}`, { method: "DELETE" });
				},
				async probeDataSource(key, user) {
					return (await request(`/datasources/${keySegment(key)}/probe`, {
						method: "POST",
						body: JSON.stringify(user === void 0 ? {} : { user })
					})).result;
				},
				async bindDataSource(key, projectId) {
					await request(`/datasources/${keySegment(key)}/binding`, {
						method: "PUT",
						body: JSON.stringify({ projectId })
					});
				}
			};
		}
		//#endregion
		//#region src/client/digest/api.ts
		/**
		* The digestion ledger calls the UI drives: thin calls against `/yon/api/digest`.
		*
		* Read-only by design. The ledger is appended by the tools themselves — a browser
		* tab has no business writing a verdict it did not compute, and letting it would
		* turn a record of what happened into a record of what someone typed.
		*
		* It lives outside the component like the other API clients: the apply world
		* builds one and hands the methods to the entry through an inject face, so a
		* component never fetches and never learns a URL.
		*/
		/**
		* Build the API client.
		* @returns the operations the UI calls.
		*/
		function createDigestApi() {
			const query = (params) => {
				const search = new URLSearchParams();
				for (const [key, value] of Object.entries(params)) {
					if (value === void 0) continue;
					search.set(key, String(value));
				}
				const text = search.toString();
				return text === "" ? "" : `?${text}`;
			};
			return { summary(recent, window) {
				return request(`/digest/summary${query({
					recent,
					window
				})}`);
			} };
		}
		/** 一条计量项的中文名，与宿主 `DIGEST_METRIC_LABELS` 一致。 */
		const METRIC_LABELS = {
			terms: "术语",
			identifiers: "标识符",
			level1: "一级章节",
			level2: "二级章节",
			constraints: "约束句",
			fidelity: "保真",
			provenance: "溯源",
			overlap: "重叠",
			addressable: "可寻址"
		};
		/** 面板上显示计量项的顺序。 */
		const METRIC_ORDER = [
			"terms",
			"identifiers",
			"level1",
			"level2",
			"constraints",
			"fidelity",
			"provenance",
			"overlap",
			"addressable"
		];
		/**
		* 每一项的说明在词典里的键。
		*
		* 这一屏上每个词都是这套流程的内部术语——摸底、门禁、保真、溯源——它们此前只
		* 存在于工具报告和 skill 里。**一个要先读文档才能读懂的面板，等于没把结果交付
		* 出去**，所以每项都要有一句话解释它是什么、阈值多少。类型写成 `YonPanelKey`
		* 而不是 `string`：漏一个键时编译就不过。
		*/
		const METRIC_ABOUT_KEYS = {
			terms: "digest.metricTermsAbout",
			identifiers: "digest.metricIdentifiersAbout",
			level1: "digest.metricLevel1About",
			level2: "digest.metricLevel2About",
			constraints: "digest.metricConstraintsAbout",
			fidelity: "digest.metricFidelityAbout",
			provenance: "digest.metricProvenanceAbout",
			overlap: "digest.metricOverlapAbout",
			addressable: "digest.metricAddressableAbout"
		};
		/** 结局的中文名。 */
		const OUTCOME_LABELS = {
			pass: "合格",
			fail: "不合格",
			gate: "门禁",
			plan: "摸底",
			sweep: "体检"
		};
		/**
		* One entry's **content**, without naming its tool or its outcome.
		*
		* Both of those are already on the row — the outcome is the badge on the right, the
		* tool is in the label — so repeating them here produced rows like
		* 「摸底 3 章摸底」. The line's job is to say *what the run found*, nothing else.
		*
		* Two outcomes deliberately report no score:
		* - a **plan** has no verdict at all, only a chapter count;
		* - a **gate** run's product IS the source document, so every coverage figure is
		*   necessarily 100%. That is a denominator cancelling out, not a measurement —
		*   showing it would dress up "nothing was measured" as "measured, and perfect".
		*
		* @param entry - the ledger row.
		* @returns the line.
		*/
		function entryLine(entry) {
			if (entry.outcome === "sweep") {
				const line = `${entry.scanned ?? 0} 份 → 合格 ${entry.passing ?? 0} / 不合格 ${entry.failing ?? 0}`;
				const never = entry.neverAudited ?? 0;
				return never > 0 ? `${line} / 未验收 ${never}` : line;
			}
			if (entry.outcome === "plan") return `识别到 ${entry.chapters ?? 0} 章`;
			if (entry.outcome === "gate") return entry.source.split(/[\\/]/).pop() ?? entry.source;
			const terms = entry.metrics.terms;
			if (typeof terms === "number") return `术语 ${(terms * 100).toFixed(1)}%`;
			return entry.product === "" ? entry.label : entry.product;
		}
		//#endregion
		//#region src/client/home/api.ts
		/**
		* The Home calls the UI drives: thin calls against `/yon/api/homes`.
		*
		* Outside the components for the same reason the other three APIs are: the apply
		* world builds one of these and hands the methods through an inject face, so a
		* component never fetches, never subscribes, and never learns a URL.
		*
		* An `id` is generated from the entry's own label and version, so unlike a
		* datasource key it is plain ASCII-ish text — but it is still encoded on the way
		* into the path, because it is derived from what the operator typed and nothing
		* stops that being Chinese.
		*/
		/** One id as a URL segment. */
		const idSegment = (id) => encodeURIComponent(id);
		/**
		* Build the API client.
		* @returns the operations the UI calls.
		*/
		function createHomeApi() {
			return {
				listHomes() {
					return request("/homes");
				},
				async saveHome(id, input) {
					const body = JSON.stringify(input);
					return (id === void 0 ? await request("/homes", {
						method: "POST",
						body
					}) : await request(`/homes/${idSegment(id)}`, {
						method: "PUT",
						body
					})).home;
				},
				async removeHome(id) {
					await request(`/homes/${idSegment(id)}`, { method: "DELETE" });
				},
				async probeHome(id) {
					return (await request(`/homes/${idSegment(id)}/probe`, {
						method: "POST",
						body: "{}"
					})).home;
				},
				async setDefaultHome(id) {
					return (await request(`/homes/${idSegment(id)}/default`, {
						method: "PUT",
						body: "{}"
					})).home;
				},
				async metaStatus(id, fresh) {
					return (await request(`/homes/${idSegment(id)}/meta-index${fresh ? "" : "?fresh=0"}`)).status;
				},
				async buildMeta(id) {
					const answer = await request(`/homes/${idSegment(id)}/meta-index`, {
						method: "POST",
						body: "{}"
					});
					return {
						started: answer.started,
						status: answer.status
					};
				},
				pickPath() {
					return request("/pick-directory", {
						method: "POST",
						body: "{}"
					});
				}
			};
		}
		//#endregion
		//#region src/client/project/api.ts
		/**
		* The project calls the UI drives: thin calls against `/yon/api/projects`.
		*
		* It lives outside the components on purpose. The apply world builds one of
		* these and hands the methods to components through an inject face, so a
		* component never fetches, never subscribes, and never learns a URL.
		*/
		/** Field-name URL segment: any text the operator typed. */
		const fieldSegment = (fieldKey) => encodeURIComponent(fieldKey);
		/**
		* Build the API client.
		* @returns the operations the UI calls.
		*/
		function createProjectApi() {
			return {
				async listProjects(includeArchived = false) {
					return (await request(`/projects${includeArchived ? "?archived=1" : ""}`)).projects;
				},
				async getProject(projectId) {
					return (await request(`/projects/${encodeURIComponent(projectId)}`)).project;
				},
				async createProject(input) {
					return (await request("/projects", {
						method: "POST",
						body: JSON.stringify(input)
					})).project;
				},
				async updateProject(projectId, patch) {
					return (await request(`/projects/${encodeURIComponent(projectId)}`, {
						method: "PATCH",
						body: JSON.stringify(patch)
					})).project;
				},
				async setField(projectId, fieldKey, value) {
					return (await request(`/projects/${encodeURIComponent(projectId)}/fields/${fieldSegment(fieldKey)}`, {
						method: "PUT",
						body: JSON.stringify({ value })
					})).project;
				},
				async removeField(projectId, fieldKey) {
					return (await request(`/projects/${encodeURIComponent(projectId)}/fields/${fieldSegment(fieldKey)}`, { method: "DELETE" })).project;
				},
				async archiveProject(projectId, archived) {
					return (await request(`/projects/${encodeURIComponent(projectId)}/archive`, {
						method: "POST",
						body: JSON.stringify({ archived })
					})).project;
				},
				async removeProject(projectId) {
					await request(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
				}
			};
		}
		//#endregion
		//#region src/client/skill/api.ts
		/**
		* The skill calls the UI drives: thin calls against `/yon/api/skills`.
		*
		* The panel needs exactly three things from this module — the merged list (this
		* plugin's skills first, the operator's after), one skill's body, and the
		* switch. The switch only ever accepts a name this plugin ships: the host
		* answers 404 for anything else, so the panel cannot use it to disturb a skill
		* living in the operator's own directories.
		*/
		/**
		* Build the API client.
		* @returns the operations the UI calls.
		*/
		function createSkillApi() {
			return {
				async listSkills() {
					return await request("/skills");
				},
				async getSkill(name) {
					return (await request(`/skills/${encodeURIComponent(name)}`)).skill;
				},
				async setSkillEnabled(name, enabled) {
					const body = { enabled };
					return (await request(`/skills/${encodeURIComponent(name)}`, {
						method: "PATCH",
						body: JSON.stringify(body)
					})).skill;
				}
			};
		}
		//#endregion
		//#region src/client/wiki/api.ts
		/**
		* The knowledge base calls the UI drives: thin calls against `/yon/api/wiki`.
		*
		* It lives outside the components on purpose, like the other three API clients.
		* The apply world builds one of these and hands the methods to the entry through
		* an inject face, so a component never fetches and never learns a URL.
		*
		* A vault is still not editable from here: its path is a machine fact the
		* operator sets once, and this surface reports rather than configures. What it
		* reports grew, though — a vault's health, a search across its pages, one page as
		* a card and the pages citing a missing entity are all answers about what is
		* already on disk, not changes to it.
		*/
		/**
		* Build the API client.
		* @returns the operations the UI calls.
		*/
		function createWikiApi() {
			/** A query string from the parameters that are present. */
			const query = (params) => {
				const search = new URLSearchParams();
				for (const [key, value] of Object.entries(params)) {
					if (value === void 0 || value === "") continue;
					search.set(key, String(value));
				}
				const text = search.toString();
				return text === "" ? "" : `?${text}`;
			};
			return {
				listVaults() {
					return request("/wiki");
				},
				rebuildVault(vault) {
					return request("/wiki/rebuild", {
						method: "POST",
						body: JSON.stringify(vault === void 0 ? {} : { vault })
					});
				},
				async recentWrites(vault, limit) {
					return (await request(`/wiki/recent${query({
						vault,
						limit
					})}`)).entries;
				},
				health(vault, gaps) {
					return request(`/wiki/health${query({
						vault,
						gaps
					})}`);
				},
				search(term, vault, limit) {
					return request(`/wiki/search${query({
						term,
						vault,
						limit
					})}`);
				},
				pageCard(page, vault) {
					return request(`/wiki/card${query({
						page,
						vault
					})}`);
				},
				citers(uri, vault) {
					return request(`/wiki/citers${query({
						uri,
						vault
					})}`);
				}
			};
		}
		//#endregion
		//#region src/client/cn.ts
		/**
		* Join CSS-module class names.
		*
		* The stylesheet map is typed `Record<string, string>` and this project compiles
		* with `noUncheckedIndexedAccess`, so every lookup reads as `string | undefined`
		* even for a class that is certainly there. The primitives this plugin composes
		* declare `className?: string` (no `undefined` under
		* `exactOptionalPropertyTypes`), so the narrowing happens once, here, instead of
		* as `?? ''` at every call site.
		*/
		/**
		* Join the class names that are present.
		* @param names - class names, or falsy values to skip.
		* @returns one space-separated class attribute value.
		*/
		function cn(...names) {
			return names.filter((name) => typeof name === "string" && name !== "").join(" ");
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\panel.module.css.mjs
		const css$7 = ".ll1Rqa_manager.ll1Rqa_manager{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);width:min(680px,100%);max-height:calc(100vh - 48px)}.ll1Rqa_managerContent{min-height:0}.ll1Rqa_body{align-items:stretch;gap:16px;height:min(62vh,520px);display:flex}.ll1Rqa_manager :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.ll1Rqa_listPane{border-right:.5px solid var(--dsw-alias-border-l1);flex-direction:column;flex:none;gap:6px;width:212px;min-height:0;padding-right:16px;display:flex}.ll1Rqa_listHead{flex:none;justify-content:space-between;align-items:center;gap:8px;min-height:28px;display:flex}.ll1Rqa_listTitle{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:18px}.ll1Rqa_projects{flex-direction:column;flex:1;gap:2px;min-height:0;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}.ll1Rqa_projectRow{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;align-items:center;gap:8px;padding:6px 8px;font-family:inherit;font-size:13px;line-height:18px;display:flex}.ll1Rqa_projectRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.ll1Rqa_projectRow[aria-selected=true]{background:var(--dsw-alias-interactive-bg-active)}.ll1Rqa_projectRow[data-archived]{color:var(--dsw-alias-label-tertiary)}.ll1Rqa_projectMark{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex}.ll1Rqa_projectName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.ll1Rqa_projectCode{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;font-size:12px;line-height:16px}.ll1Rqa_projectMeta{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}.ll1Rqa_tag{border:.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:12px;line-height:16px;display:inline-block}.ll1Rqa_tagPass{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}.ll1Rqa_tagFail{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}.ll1Rqa_tagMuted{color:var(--dsw-alias-label-dimmed);border-color:var(--dsw-alias-label-dimmed)}.ll1Rqa_foldToggle{color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:none;padding:0;font-family:inherit;font-size:12px;line-height:16px}.ll1Rqa_foldToggle:hover{text-decoration:underline}.ll1Rqa_projectRowStack{align-items:flex-start}.ll1Rqa_projectRowStack .ll1Rqa_projectMark{margin-top:2px}.ll1Rqa_projectStack{flex-direction:column;flex:1;gap:1px;min-width:0;display:flex}.ll1Rqa_projectSub{align-items:center;gap:6px;min-width:0;display:flex}.ll1Rqa_projectSub .ll1Rqa_projectCode{white-space:nowrap;text-overflow:ellipsis;flex:0 auto;min-width:0;overflow:hidden}.ll1Rqa_archivedToggle{border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);cursor:pointer;flex:none;align-items:center;gap:6px;margin-top:2px;padding-top:8px;font-size:12px;line-height:16px;display:inline-flex}.ll1Rqa_archivedToggle input{accent-color:var(--dsw-alias-button-primary-fill);margin:0}.ll1Rqa_detailPane{--label-col:96px;--text-inset:6.5px;flex-direction:column;flex:1;gap:10px;min-width:0;min-height:0;padding-right:2px;display:flex;overflow-y:auto}.ll1Rqa_empty{text-align:center;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:10px;padding:24px 16px;display:flex}.ll1Rqa_emptyMark{color:var(--dsw-alias-label-dimmed);display:inline-flex}.ll1Rqa_emptyTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;line-height:18px}.ll1Rqa_note{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:16px}.ll1Rqa_hint{color:var(--dsw-alias-label-tertiary);margin:2px 0 0;font-size:12px;line-height:16px}.ll1Rqa_inlineText{box-sizing:border-box;text-align:left;cursor:text;background:0 0;border:.5px solid #0000;border-radius:8px;width:100%;margin:0;padding:2px 6px;font-family:inherit;display:block}.ll1Rqa_inlineText:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}.ll1Rqa_inlineText:disabled{cursor:default}.ll1Rqa_inlineTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}.ll1Rqa_inlineValue{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}.ll1Rqa_inlineEmpty{color:var(--dsw-alias-label-dimmed)}.ll1Rqa_detailName{min-width:0}.ll1Rqa_props{grid-template-columns:var(--label-col) minmax(0, 1fr);align-items:start;gap:6px 8px;margin:0;display:grid}.ll1Rqa_propLabel{padding-left:var(--text-inset);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.ll1Rqa_propValue{color:var(--dsw-alias-label-secondary);min-width:0;margin:0;font-size:13px;line-height:18px}.ll1Rqa_statusGroup{border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;flex-wrap:wrap;gap:2px;padding:2px;display:inline-flex}.ll1Rqa_statusGroup>button:disabled{opacity:.5;cursor:not-allowed}.ll1Rqa_detailActions{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.ll1Rqa_detailActions:last-child{z-index:1;border-top:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);padding:8px 0;position:sticky;bottom:0}.ll1Rqa_dangerButton.ll1Rqa_dangerButton{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}.ll1Rqa_dangerButton.ll1Rqa_dangerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.ll1Rqa_detailActions .ll1Rqa_dangerButton{margin-left:auto}.ll1Rqa_rule{border:0;border-top:.5px solid var(--dsw-alias-border-l1);height:0;margin:2px 0}.ll1Rqa_fields{flex-direction:column;gap:6px;margin-top:6px;display:flex}.ll1Rqa_fieldsHead{justify-content:space-between;align-items:center;gap:8px;min-height:28px;display:flex}.ll1Rqa_sectionTitle{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;font-weight:600;line-height:18px}.ll1Rqa_fieldRow{align-items:flex-start;gap:8px;min-height:32px;display:flex}.ll1Rqa_fieldKey{box-sizing:border-box;width:var(--label-col);padding:4.5px 0 0 var(--text-inset);text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:16px;overflow:hidden}.ll1Rqa_inputFill{width:100%;min-width:0;display:flex}.ll1Rqa_fieldRow .ll1Rqa_inputFill{flex:1}.ll1Rqa_fieldValueRead{white-space:pre-wrap;overflow-wrap:anywhere;flex:1;min-width:0}.ll1Rqa_fieldRowWide{flex-wrap:wrap;row-gap:2px}.ll1Rqa_fieldRowWide .ll1Rqa_fieldValueRead{flex:100%;order:1}.ll1Rqa_fieldRowWide .ll1Rqa_rowFailed,.ll1Rqa_fieldRowWide .ll1Rqa_rowTrail{margin-left:auto}.ll1Rqa_valueGrid{grid-template-columns:var(--label-col) minmax(0, 1fr);gap:1px 8px;width:100%;display:grid}.ll1Rqa_valueGridKey{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.ll1Rqa_valueGridValue{min-width:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:18px}.ll1Rqa_valueJson{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;display:block}.ll1Rqa_valueEditor{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-1);min-width:0;min-height:32px;max-height:45vh;color:var(--dsw-alias-label-primary);field-sizing:content;resize:none;border-radius:8px;flex:100%;order:1;padding:4px 8px;font-family:inherit;font-size:14px;line-height:22px;overflow-y:auto}.ll1Rqa_valueEditor:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.ll1Rqa_rowTrail{flex:none;justify-content:flex-end;align-items:center;gap:8px;width:64px;display:flex}.ll1Rqa_rowState{min-width:0;color:var(--dsw-alias-label-tertiary);text-align:right;flex:1;font-size:12px;line-height:16px}.ll1Rqa_rowFailed{max-width:150px;color:var(--dsw-alias-state-error-primary);text-align:right;cursor:pointer;background:0 0;border:0;flex:none;padding:0 4px;font-family:inherit;font-size:12px;line-height:16px;text-decoration:underline dotted}.ll1Rqa_rowIcon{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:8px;flex:none;justify-content:center;align-items:center;padding:0;font-family:inherit;font-size:16px;line-height:1;display:inline-flex}.ll1Rqa_rowIcon:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ll1Rqa_rowIcon:disabled{opacity:.4;cursor:not-allowed}.ll1Rqa_rowRemove:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}@media (hover:hover){.ll1Rqa_fieldRow:not(:hover):not(:focus-within) .ll1Rqa_rowAction:not(:disabled){opacity:0;transition:opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out)}}.ll1Rqa_rowCopied,.ll1Rqa_rowCopied:not(:disabled):hover{color:var(--dsw-alias-state-success-primary)}.ll1Rqa_rowCopyFailed,.ll1Rqa_rowCopyFailed:not(:disabled):hover{color:var(--dsw-alias-state-error-primary)}.ll1Rqa_draftKey.ll1Rqa_draftKey{width:var(--label-col);flex:none}.ll1Rqa_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;align-items:center;gap:8px;margin:0;padding:6px 10px;font-size:12px;line-height:16px;display:flex}.ll1Rqa_errorText{flex:1;min-width:0}.ll1Rqa_errorAction{color:inherit;cursor:pointer;background:0 0;border:0;flex:none;padding:0;font-family:inherit;font-size:12px;line-height:16px;text-decoration:underline}.ll1Rqa_form{flex-direction:column;gap:12px;display:flex}.ll1Rqa_formRow{flex-direction:column;gap:4px;display:flex}.ll1Rqa_formLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}.ll1Rqa_formError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:16px}";
		const tagId$7 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$7) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$7;
			tag.textContent = css$7;
			document.head.appendChild(tag);
		}
		var panel_module_css_default$5 = {
			"archivedToggle": "ll1Rqa_archivedToggle",
			"body": "ll1Rqa_body",
			"dangerButton": "ll1Rqa_dangerButton",
			"detailActions": "ll1Rqa_detailActions",
			"detailName": "ll1Rqa_detailName",
			"detailPane": "ll1Rqa_detailPane",
			"draftKey": "ll1Rqa_draftKey",
			"empty": "ll1Rqa_empty",
			"emptyMark": "ll1Rqa_emptyMark",
			"emptyTitle": "ll1Rqa_emptyTitle",
			"error": "ll1Rqa_error",
			"errorAction": "ll1Rqa_errorAction",
			"errorText": "ll1Rqa_errorText",
			"fieldKey": "ll1Rqa_fieldKey",
			"fieldRow": "ll1Rqa_fieldRow",
			"fieldRowWide": "ll1Rqa_fieldRowWide",
			"fieldValueRead": "ll1Rqa_fieldValueRead",
			"fields": "ll1Rqa_fields",
			"fieldsHead": "ll1Rqa_fieldsHead",
			"foldToggle": "ll1Rqa_foldToggle",
			"form": "ll1Rqa_form",
			"formError": "ll1Rqa_formError",
			"formLabel": "ll1Rqa_formLabel",
			"formRow": "ll1Rqa_formRow",
			"hint": "ll1Rqa_hint",
			"inlineEmpty": "ll1Rqa_inlineEmpty",
			"inlineText": "ll1Rqa_inlineText",
			"inlineTitle": "ll1Rqa_inlineTitle",
			"inlineValue": "ll1Rqa_inlineValue",
			"inputFill": "ll1Rqa_inputFill",
			"listHead": "ll1Rqa_listHead",
			"listPane": "ll1Rqa_listPane",
			"listTitle": "ll1Rqa_listTitle",
			"manager": "ll1Rqa_manager",
			"managerContent": "ll1Rqa_managerContent",
			"note": "ll1Rqa_note",
			"projectCode": "ll1Rqa_projectCode",
			"projectMark": "ll1Rqa_projectMark",
			"projectMeta": "ll1Rqa_projectMeta",
			"projectName": "ll1Rqa_projectName",
			"projectRow": "ll1Rqa_projectRow",
			"projectRowStack": "ll1Rqa_projectRowStack",
			"projectStack": "ll1Rqa_projectStack",
			"projectSub": "ll1Rqa_projectSub",
			"projects": "ll1Rqa_projects",
			"propLabel": "ll1Rqa_propLabel",
			"propValue": "ll1Rqa_propValue",
			"props": "ll1Rqa_props",
			"rowAction": "ll1Rqa_rowAction",
			"rowCopied": "ll1Rqa_rowCopied",
			"rowCopyFailed": "ll1Rqa_rowCopyFailed",
			"rowFailed": "ll1Rqa_rowFailed",
			"rowIcon": "ll1Rqa_rowIcon",
			"rowRemove": "ll1Rqa_rowRemove",
			"rowState": "ll1Rqa_rowState",
			"rowTrail": "ll1Rqa_rowTrail",
			"rule": "ll1Rqa_rule",
			"sectionTitle": "ll1Rqa_sectionTitle",
			"statusGroup": "ll1Rqa_statusGroup",
			"tag": "ll1Rqa_tag",
			"tagFail": "ll1Rqa_tagFail",
			"tagMuted": "ll1Rqa_tagMuted",
			"tagPass": "ll1Rqa_tagPass",
			"valueEditor": "ll1Rqa_valueEditor",
			"valueGrid": "ll1Rqa_valueGrid",
			"valueGridKey": "ll1Rqa_valueGridKey",
			"valueGridValue": "ll1Rqa_valueGridValue",
			"valueJson": "ll1Rqa_valueJson"
		};
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\datasource\panel.module.css.mjs
		const css$6 = ".VUz1Nq_title{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:0 0 6px;font-size:14px;font-weight:600;display:flex}.VUz1Nq_rowUnsupported{opacity:.55}.VUz1Nq_mono{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.VUz1Nq_select{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);width:100%;height:28px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;padding:0 6px;font-family:inherit;font-size:12px;line-height:18px}.VUz1Nq_select:disabled{opacity:.5;cursor:not-allowed}.VUz1Nq_pair{grid-template-columns:minmax(0,1fr) 96px;gap:8px;display:grid}";
		const tagId$6 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$6;
			tag.textContent = css$6;
			document.head.appendChild(tag);
		}
		var panel_module_css_default$4 = {
			"mono": "VUz1Nq_mono",
			"pair": "VUz1Nq_pair",
			"rowUnsupported": "VUz1Nq_rowUnsupported",
			"select": "VUz1Nq_select",
			"title": "VUz1Nq_title"
		};
		//#endregion
		//#region src/client/datasource/DataSourceManager.tsx
		/**
		* The datasource surface: every registered connection on one side, the selected
		* one's details on the other, and — the part that separates this surface from a
		* viewer — the ability to add, edit, test and bind them.
		*
		* ## Why this surface may write where the old one could not
		*
		* The connections live in a document this plugin owns, under the operator's DSH
		* directory (`datasource-store.ts` spells out why). Nothing here reaches into
		* another tool's files, so offering to change them is not a liberty — it is the
		* only way a fresh install can have any connection at all. An install with no
		* document and no way to add one would show an empty list forever.
		*
		* ## What this surface never sees, and why that shapes the form
		*
		* A password travels inward only: it is typed here, sent once, and never
		* returned. So the detail pane can say whether a secret is stored but not what
		* it is, and the edit form leaves the password field empty with an explicit
		* "leave blank to keep it" — because an empty box that silently meant "erase the
		* secret" would be a data loss disguised as an edit.
		*
		* Nothing here fetches: every call arrives as a prop from the entry's inject
		* face, which is what keeps this file testable without the host.
		*/
		/** Below this many rows the list is short enough to read without a search box. */
		const SEARCH_THRESHOLD$3 = 8;
		/** The database types the create form offers, before the free-text fallback. */
		const KNOWN_TYPES = [
			"oracle",
			"dm",
			"mysql",
			"postgresql",
			"oceanbase",
			"mssql"
		];
		/** A blank draft, or one seeded from an existing row. */
		function draftOf$1(row) {
			if (row === void 0) return {
				configKey: "",
				env: "test",
				dbType: "oracle",
				host: "",
				port: "",
				serviceName: "",
				user: "",
				password: ""
			};
			return {
				key: row.key,
				configKey: row.configKey,
				env: row.env,
				dbType: row.dbType,
				host: row.host,
				port: row.port === 0 ? "" : String(row.port),
				serviceName: row.serviceName,
				user: row.userNames[0] ?? "",
				password: ""
			};
		}
		/**
		* The mark in front of every row: the same cylinder the entry cell uses.
		* @returns the decorative glyph.
		*/
		function CylinderMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ellipse", {
						cx: "8",
						cy: "3.9",
						rx: "5.25",
						ry: "2.15",
						stroke: "currentColor",
						strokeWidth: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.75 3.9v8.2c0 1.19 2.35 2.15 5.25 2.15s5.25-.96 5.25-2.15V3.9",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.75 8c0 1.19 2.35 2.15 5.25 2.15S13.25 9.19 13.25 8",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					})
				]
			});
		}
		/**
		* Render the datasource surface.
		* @param props - injected API, copy seat, and close verb.
		* @returns the dialog.
		*/
		function DataSourceManager({ t, onClose, ...api }) {
			const [sources, setSources] = (0, react.useState)([]);
			const [projects, setProjects] = (0, react.useState)([]);
			const [complete, setComplete] = (0, react.useState)(true);
			const [configPath, setConfigPath] = (0, react.useState)("");
			const [seededFrom, setSeededFrom] = (0, react.useState)();
			const [probeAvailable, setProbeAvailable] = (0, react.useState)(true);
			const [selected, setSelected] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)();
			const [query, setQuery] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)();
			const [probeNote, setProbeNote] = (0, react.useState)();
			const [confirmingRemove, setConfirmingRemove] = (0, react.useState)(false);
			const focusedOnce = (0, react.useRef)(false);
			const list = (0, react.useRef)(null);
			const forget = (cause) => cause instanceof Error ? cause.message : String(cause);
			/** Read the rows and the project list together, so the picker is never stale. */
			const load = (0, react.useCallback)((keepKey) => {
				setLoading(true);
				setFailure(void 0);
				return Promise.all([api.listDataSources(), api.listProjects(true)]).then(([payload, list]) => {
					setSources(payload.sources);
					setComplete(payload.complete);
					setConfigPath(payload.configPath);
					setProbeAvailable(payload.probeAvailable);
					setSeededFrom(payload.seededFrom);
					setProjects(list);
					setSelected((previous) => {
						const wanted = keepKey ?? previous;
						if (wanted !== void 0 && payload.sources.some((row) => row.key === wanted)) return wanted;
						return payload.sources[0]?.key;
					});
				}, (cause) => {
					setFailure(forget(cause));
				}).finally(() => {
					setLoading(false);
				});
			}, [api]);
			(0, react.useEffect)(() => {
				load();
			}, []);
			/** Run one mutation, then re-read so the list reflects what was stored. */
			const act = (work, keepKey) => {
				(async () => {
					setBusy(true);
					setFailure(void 0);
					try {
						await work();
						await load(keepKey);
					} catch (cause) {
						setFailure(forget(cause));
					} finally {
						setBusy(false);
					}
				})();
			};
			const current = sources.find((row) => row.key === selected);
			/** Save the open draft, then select whatever it produced. */
			const save = () => {
				const open = draft;
				if (open === void 0) return;
				const port = Number.parseInt(open.port, 10);
				const user = open.user.trim();
				act(async () => {
					const saved = await api.saveDataSource({
						configKey: open.configKey.trim(),
						env: open.env.trim(),
						dbType: open.dbType.trim(),
						host: open.host.trim(),
						port: Number.isFinite(port) ? port : 0,
						serviceName: open.serviceName.trim(),
						...open.password === "" ? {} : { users: { [user]: open.password } }
					});
					setDraft(void 0);
					setProbeNote(void 0);
					await load(saved.key);
				}, `${open.configKey.trim()}::${open.env.trim()}`);
			};
			/** Run `SELECT 1` against the selected row. */
			const probe = (row) => {
				setProbeNote(void 0);
				setBusy(true);
				setFailure(void 0);
				api.probeDataSource(row.key, row.userNames[0]).then((result) => {
					if (!result.ok) {
						setProbeNote(t("datasource.testFailed", { message: result.error ?? "" }));
						return;
					}
					setProbeNote(result.rowCount === void 0 ? t("datasource.testOk", { ms: result.latencyMs }) : t("datasource.testOkRows", {
						ms: result.latencyMs,
						rows: result.rowCount
					}));
				}, (cause) => {
					setFailure(forget(cause));
				}).finally(() => {
					setBusy(false);
				});
			};
			(0, react.useEffect)(() => {
				if (loading || focusedOnce.current) return;
				focusedOnce.current = true;
				list.current?.querySelector("[role=\"option\"][tabindex=\"0\"]")?.focus();
			}, [loading]);
			const needle = query.trim().toLowerCase();
			const visible = needle === "" ? sources : sources.filter((row) => row.key.toLowerCase().includes(needle) || row.host.toLowerCase().includes(needle) || row.dbType.toLowerCase().includes(needle));
			const tabbableKey = selected ?? visible[0]?.key;
			const row = (source) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "option",
				"aria-selected": source.key === selected,
				tabIndex: source.key === tabbableKey ? 0 : -1,
				className: cn(panel_module_css_default$5.projectRow, !source.probeable ? panel_module_css_default$4.rowUnsupported : void 0),
				"data-key": source.key,
				onClick: () => {
					setSelected(source.key);
					setDraft(void 0);
					setProbeNote(void 0);
					setConfirmingRemove(false);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectMark),
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CylinderMark, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectName),
						title: source.key,
						children: source.configKey
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectMeta),
						children: source.env
					})
				]
			}) }, source.key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("datasource.title"),
				closeLabel: t("datasource.close"),
				className: cn(panel_module_css_default$5.manager),
				contentClassName: cn(panel_module_css_default$5.managerContent),
				children: [
					failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: cn(panel_module_css_default$5.error),
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$5.errorText),
							children: t("datasource.actionFailed", { message: failure })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn(panel_module_css_default$5.errorAction),
							onClick: () => {
								load();
							},
							children: t("datasource.retry")
						})]
					}),
					seededFrom !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.note),
						children: t("datasource.seeded", { path: seededFrom })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default$5.body),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: cn(panel_module_css_default$5.listPane),
							"aria-label": t("datasource.list"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.listHead),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.listTitle),
										children: t("datasource.list")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => {
											setDraft(draftOf$1());
											setProbeNote(void 0);
											setConfirmingRemove(false);
										},
										children: t("datasource.new")
									})]
								}),
								sources.length >= SEARCH_THRESHOLD$3 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									type: "search",
									className: cn(panel_module_css_default$5.inputFill),
									"aria-label": t("datasource.search"),
									placeholder: t("datasource.search"),
									value: query,
									onChange: (event) => {
										setQuery(event.target.value);
									}
								}),
								!complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("datasource.partial")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									ref: list,
									className: cn(panel_module_css_default$5.projects),
									role: "listbox",
									"aria-label": t("datasource.list"),
									children: visible.map(row)
								}),
								needle !== "" && visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("datasource.searchEmpty", { query: query.trim() })
								}),
								configPath !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									title: configPath,
									children: t("datasource.pathHint", { path: configPath })
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
							className: cn(panel_module_css_default$5.detailPane),
							children: draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								className: cn(panel_module_css_default$5.form),
								onSubmit: (event) => {
									event.preventDefault();
									save();
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: cn(panel_module_css_default$4.title),
										children: draft.key === void 0 ? t("datasource.createTitle") : t("datasource.editTitle")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.formRow),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-ds-key",
											children: t("datasource.key")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											id: "yon-ds-key",
											className: cn(panel_module_css_default$5.inputFill),
											value: draft.configKey,
											disabled: draft.key !== void 0,
											placeholder: t("datasource.keyPlaceholder"),
											onChange: (event) => {
												setDraft({
													...draft,
													configKey: event.target.value
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.formRow),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-ds-env",
											children: t("datasource.env")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											id: "yon-ds-env",
											className: cn(panel_module_css_default$5.inputFill),
											value: draft.env,
											disabled: draft.key !== void 0,
											placeholder: t("datasource.envPlaceholder"),
											onChange: (event) => {
												setDraft({
													...draft,
													env: event.target.value
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.formRow),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-ds-type",
											children: t("datasource.dbType")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											id: "yon-ds-type",
											className: cn(panel_module_css_default$4.select),
											value: draft.dbType,
											onChange: (event) => {
												setDraft({
													...draft,
													dbType: event.target.value
												});
											},
											children: [.../* @__PURE__ */ new Set([...KNOWN_TYPES, ...draft.dbType === "" ? [] : [draft.dbType]])].map((type) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: type,
												children: type
											}, type))
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$4.pair),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: cn(panel_module_css_default$5.formRow),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: cn(panel_module_css_default$5.formLabel),
												htmlFor: "yon-ds-host",
												children: t("datasource.host")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												id: "yon-ds-host",
												className: cn(panel_module_css_default$5.inputFill),
												value: draft.host,
												placeholder: t("datasource.hostPlaceholder"),
												onChange: (event) => {
													setDraft({
														...draft,
														host: event.target.value
													});
												}
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: cn(panel_module_css_default$5.formRow),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: cn(panel_module_css_default$5.formLabel),
												htmlFor: "yon-ds-port",
												children: t("datasource.port")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												id: "yon-ds-port",
												className: cn(panel_module_css_default$5.inputFill),
												value: draft.port,
												placeholder: t("datasource.portPlaceholder"),
												onChange: (event) => {
													setDraft({
														...draft,
														port: event.target.value
													});
												}
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.formRow),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-ds-service",
											children: t("datasource.service")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											id: "yon-ds-service",
											className: cn(panel_module_css_default$5.inputFill),
											value: draft.serviceName,
											placeholder: t("datasource.servicePlaceholder"),
											onChange: (event) => {
												setDraft({
													...draft,
													serviceName: event.target.value
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.formRow),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-ds-user",
											children: t("datasource.logins")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											id: "yon-ds-user",
											className: cn(panel_module_css_default$5.inputFill),
											value: draft.user,
											placeholder: t("datasource.userPlaceholder"),
											onChange: (event) => {
												setDraft({
													...draft,
													user: event.target.value
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.formRow),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: cn(panel_module_css_default$5.formLabel),
												htmlFor: "yon-ds-secret",
												children: t("datasource.password")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												id: "yon-ds-secret",
												type: "password",
												className: cn(panel_module_css_default$5.inputFill),
												value: draft.password,
												placeholder: t("datasource.passwordPlaceholder"),
												onChange: (event) => {
													setDraft({
														...draft,
														password: event.target.value
													});
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: cn(panel_module_css_default$5.hint),
												children: t("datasource.usersHint")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cn(panel_module_css_default$5.detailActions),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											type: "submit",
											size: "sm",
											disabled: busy,
											children: busy ? t("datasource.saving") : t("datasource.save")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											type: "button",
											size: "sm",
											variant: "outline",
											disabled: busy,
											onClick: () => {
												setDraft(void 0);
											},
											children: t("datasource.cancel")
										})]
									})
								]
							}) : current === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$5.empty),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.emptyMark),
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CylinderMark, {})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cn(panel_module_css_default$5.emptyTitle),
										children: loading ? t("datasource.loading") : sources.length === 0 ? t("datasource.empty") : t("datasource.pickHint")
									}),
									sources.length === 0 && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cn(panel_module_css_default$5.note),
										children: t("datasource.emptyHint")
									})
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
									className: cn(panel_module_css_default$4.title),
									children: [current.configKey, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.projectMeta),
										children: current.env
									})]
								}),
								!current.probeable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("datasource.noConnector", { type: current.dbType })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: cn(panel_module_css_default$5.props),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("datasource.type")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: current.dbType === "" ? "—" : current.dbType
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("datasource.host")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: cn(panel_module_css_default$4.mono),
												children: [
													current.host,
													":",
													current.port
												]
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("datasource.service")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: current.serviceName === "" ? "—" : current.serviceName
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("datasource.logins")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: current.userNames.length === 0 ? "—" : current.userNames.join(" / ")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("datasource.password")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: current.hasPassword ? t("datasource.passwordStored") : t("datasource.passwordNone")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("datasource.binding")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: cn(panel_module_css_default$4.select),
												"aria-label": t("datasource.binding"),
												value: current.binding?.projectId ?? "",
												disabled: busy,
												onChange: (event) => {
													const projectId = event.target.value;
													act(() => api.bindDataSource(current.key, projectId), current.key);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: t("datasource.bindingNone")
												}), projects.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
													value: project.projectId,
													children: [project.name, project.archived ? ` (${t("project.archived")})` : ""]
												}, project.projectId))]
											})
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.hint),
									children: t("datasource.bindHint")
								}),
								probeNote !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									role: "status",
									children: probeNote
								}),
								!probeAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("datasource.probeUnavailable")
								}),
								confirmingRemove && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("datasource.removeConfirm", { key: current.key })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.detailActions),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											disabled: busy || !probeAvailable || !current.probeable,
											onClick: () => {
												probe(current);
											},
											children: busy ? t("datasource.testing") : t("datasource.test")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											disabled: busy,
											onClick: () => {
												setDraft(draftOf$1(current));
												setProbeNote(void 0);
											},
											children: t("datasource.edit")
										}),
										confirmingRemove ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											className: cn(panel_module_css_default$5.dangerButton),
											disabled: busy,
											onClick: () => {
												const target = current.key;
												setConfirmingRemove(false);
												act(async () => {
													await api.removeDataSource(target);
													setSelected(void 0);
												});
											},
											children: t("datasource.removeYes")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											disabled: busy,
											onClick: () => {
												setConfirmingRemove(false);
											},
											children: t("datasource.cancel")
										})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											className: cn(panel_module_css_default$5.dangerButton),
											disabled: busy,
											onClick: () => {
												setConfirmingRemove(true);
											},
											children: t("datasource.remove")
										})
									]
								})
							] })
						})]
					})
				]
			});
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\panel-item.module.css.mjs
		const css$5 = "._0Xs8da_item{block-size:32px;inline-size:100%;color:var(--dsw-alias-label-secondary);font:inherit;text-align:start;cursor:pointer;background:0 0;border:0;border-radius:8px;flex:none;align-items:center;gap:8px;padding:0 8px;font-size:12px;line-height:1;display:flex}._0Xs8da_item>svg{flex:none}._0Xs8da_item:hover,._0Xs8da_item[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._0Xs8da_item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}._0Xs8da_label{text-overflow:ellipsis;white-space:nowrap;min-inline-size:0;overflow:hidden}";
		const tagId$5 = "dsh-plugin-yon-panel/panel-item.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var panel_item_module_css_default = {
			"item": "_0Xs8da_item",
			"label": "_0Xs8da_label"
		};
		//#endregion
		//#region src/client/DataSourceItem.tsx
		/**
		* The panel's third built-in entry: one row that opens the datasource surface.
		*
		* The surface is a dialog rather than a region of the panel body — a 280px strip
		* cannot hold a list beside a connection's details — and this entry owns it, so
		* opening it needs no cross-seat coordination. While the surface is up the entry
		* also tells the panel to stand down, and when it closes the entry hands focus
		* back to the row that opened it. Both gestures are the ones the project entry
		* already makes; the mark, the name it is given, and the surface differ.
		*/
		/**
		* The entry's glyph: a stacked-disk cylinder, drawn here instead of imported so
		* the mark's shape and name do not track one harness release's icon set.
		* @returns the decorative svg.
		*/
		function DatabaseMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ellipse", {
						cx: "8",
						cy: "3.9",
						rx: "5.25",
						ry: "2.15",
						stroke: "currentColor",
						strokeWidth: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.75 3.9v8.2c0 1.19 2.35 2.15 5.25 2.15s5.25-.96 5.25-2.15V3.9",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.75 8c0 1.19 2.35 2.15 5.25 2.15S13.25 9.19 13.25 8",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					})
				]
			});
		}
		/**
		* Render the entry row and, while open, the datasource surface.
		* @param props - composed slot props.
		* @returns the row, plus the dialog when it is showing.
		*/
		function DataSourceItem({ t, label, pushOverlay, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const announce = (0, react.useRef)(pushOverlay);
			announce.current = pushOverlay;
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				const release = announce.current();
				return () => {
					release();
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: panel_item_module_css_default.item,
				"data-active": open ? "" : void 0,
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen((value) => !value);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DatabaseMark, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.label,
					children: label
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DataSourceManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\digest\panel.module.css.mjs
		const css$4 = ".njktAa_body{height:auto;max-height:min(62vh,520px)}.njktAa_toolbar{flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:12px;display:flex}.njktAa_tally{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.6}.njktAa_tallyNum{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-size:14px;font-weight:600}.njktAa_tallyItem{white-space:nowrap;display:inline-block}.njktAa_tallySep{color:var(--dsw-alias-label-dimmed);margin:0 6px}.njktAa_tonePass{color:var(--dsw-alias-state-success-primary)}.njktAa_toneFail{color:var(--dsw-alias-state-error-primary)}.njktAa_dim{opacity:.45}.njktAa_actions{align-items:center;gap:10px;display:flex}.njktAa_filters{border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;display:inline-flex;overflow:hidden}.njktAa_filter{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;padding:3px 9px;font-size:12px}.njktAa_filter+.njktAa_filter{border-inline-start:.5px solid var(--dsw-alias-border-l1)}.njktAa_filter:hover{background:var(--dsw-alias-interactive-bg-hover)}.njktAa_filter:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.njktAa_filterOn{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}.njktAa_sectionNote{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.njktAa_averageGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-block-end:4px;display:grid}.njktAa_averageCell{--pad:9px;--bar-ratio:0;padding:7px var(--pad) 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;gap:1px;display:flex;position:relative;overflow:hidden}.njktAa_averageCell:after{content:\"\";inset-block-end:0;inset-inline:var(--pad);background:var(--dsw-alias-border-l1);block-size:2px;position:absolute}.njktAa_averageCell[data-empty]{opacity:.4}.njktAa_averageLabel{color:var(--dsw-alias-label-tertiary);font-size:12px}.njktAa_averageValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-size:14px;font-weight:700;line-height:1.3}.njktAa_averageBar{z-index:1;inline-size:calc((100% - 2 * var(--pad)) * var(--bar-ratio));background:var(--dsw-alias-state-business-primary);border-start-end-radius:999px;border-end-end-radius:999px;block-size:2px;position:absolute;inset-block-end:0;inset-inline-start:var(--pad)}.njktAa_logList{--time-col:140px;flex-direction:column;gap:1px;margin:0;padding:0;list-style:none;display:flex}.njktAa_logRow{border-radius:8px}.njktAa_logHead{grid-template-columns:var(--time-col) minmax(0, 1fr) auto;inline-size:100%;color:inherit;font:inherit;text-align:start;cursor:pointer;background:0 0;border:0;border-radius:8px;align-items:baseline;gap:10px;padding:5px 8px;display:grid}.njktAa_logHead:hover{background:var(--dsw-alias-interactive-bg-hover)}.njktAa_logHead:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.njktAa_logTime{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.njktAa_logLine{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.njktAa_logRow+.njktAa_logRow .njktAa_logHead{border-block-start:.5px solid var(--dsw-alias-border-l1);border-start-start-radius:0;border-start-end-radius:0}.njktAa_logDetail{padding:2px 8px 10px calc(var(--time-col) + 10px)}.njktAa_detailGrid{grid-template-columns:60px minmax(0,1fr);gap:1px 10px;margin:0 0 8px;font-size:12px;display:grid}.njktAa_detailGrid dt{color:var(--dsw-alias-label-tertiary)}.njktAa_detailGrid dd{color:var(--dsw-alias-label-secondary);word-break:break-all;margin:0}.njktAa_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.njktAa_metricStrip{flex-wrap:wrap;gap:5px;display:flex}.njktAa_failedLine{color:var(--dsw-alias-state-error-primary);word-break:break-all;margin:7px 0 0;font-size:12px}.njktAa_helpToggle{border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;white-space:nowrap;background:0 0;border-radius:999px;padding:3px 9px;font-size:12px}.njktAa_helpToggle:hover{background:var(--dsw-alias-interactive-bg-hover)}.njktAa_helpToggle:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.njktAa_helpToggleOn{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}.njktAa_help{border:.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.65}.njktAa_helpBody{margin:0 0 8px}.njktAa_helpBody:last-child{margin-block-end:0}.njktAa_helpList{grid-template-columns:64px minmax(0,1fr);gap:2px 10px;margin:0 0 8px;font-size:12px;display:grid}.njktAa_helpList dt{color:var(--dsw-alias-label-primary);font-weight:600}.njktAa_helpList dd{margin:0}.njktAa_helpMetrics{flex-direction:column;gap:1px;margin:0;padding-inline-start:0;list-style:none;display:flex}.njktAa_helpMetrics b{color:var(--dsw-alias-label-primary)}.njktAa_foot{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;align-items:baseline;gap:6px;margin-block-start:4px;font-size:12px;display:flex}.njktAa_footSince:before{content:\"·\";color:var(--dsw-alias-label-dimmed);margin-inline-end:6px}.njktAa_footSince{margin-inline-start:auto}@media (width<=640px){.njktAa_logHead{grid-template-columns:minmax(0,1fr) auto;row-gap:1px}.njktAa_logTime{grid-column:1/-1}.njktAa_logDetail{padding-inline-start:8px}}@media (width<=520px){.njktAa_averageGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}";
		const tagId$4 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var panel_module_css_default$3 = {
			"actions": "njktAa_actions",
			"averageBar": "njktAa_averageBar",
			"averageCell": "njktAa_averageCell",
			"averageGrid": "njktAa_averageGrid",
			"averageLabel": "njktAa_averageLabel",
			"averageValue": "njktAa_averageValue",
			"body": "njktAa_body",
			"detailGrid": "njktAa_detailGrid",
			"dim": "njktAa_dim",
			"failedLine": "njktAa_failedLine",
			"filter": "njktAa_filter",
			"filterOn": "njktAa_filterOn",
			"filters": "njktAa_filters",
			"foot": "njktAa_foot",
			"footSince": "njktAa_footSince",
			"help": "njktAa_help",
			"helpBody": "njktAa_helpBody",
			"helpList": "njktAa_helpList",
			"helpMetrics": "njktAa_helpMetrics",
			"helpToggle": "njktAa_helpToggle",
			"helpToggleOn": "njktAa_helpToggleOn",
			"logDetail": "njktAa_logDetail",
			"logHead": "njktAa_logHead",
			"logLine": "njktAa_logLine",
			"logList": "njktAa_logList",
			"logRow": "njktAa_logRow",
			"logTime": "njktAa_logTime",
			"metricStrip": "njktAa_metricStrip",
			"mono": "njktAa_mono",
			"sectionNote": "njktAa_sectionNote",
			"tally": "njktAa_tally",
			"tallyItem": "njktAa_tallyItem",
			"tallyNum": "njktAa_tallyNum",
			"tallySep": "njktAa_tallySep",
			"toneFail": "njktAa_toneFail",
			"tonePass": "njktAa_tonePass",
			"toolbar": "njktAa_toolbar"
		};
		//#endregion
		//#region src/client/digest/DigestManager.tsx
		/**
		* The digestion ledger surface: every check the checker has run, with its score.
		*
		* ## Why this surface exists
		*
		* `digest_audit` prints a verdict once and it is gone. The model reads it, maybe
		* reworks the page, and delivers — and afterwards there is no record that the
		* check ever happened, let alone how it went. That is the wrong shape for a
		* measurement: a score you cannot see later is a score you cannot act on.
		*
		* Measured on a real vault this surface is what turns a pile of summaries into a
		* chart: 27 pages whose term coverage ran from 0.2% to 42.5% against an 85% bar,
		* one PDF digested three separate times, and a 746-byte page that called a
		* messaging-platform manual a message-queue guide. Every one of those numbers was
		* computed at some point and thrown away.
		*
		* ## What it shows, and in what order
		*
		* One line of tallies (what has been checked), then the averages (how it has been
		* going), then the entries themselves (what exactly happened). The order is the
		* order of the questions: a reader arrives asking "is this thing working", and
		* only sometimes "what did the 3rd run say".
		*
		* Averages are taken only over entries where the metric applies, so a plan — which
		* has no fidelity rate — never drags that rate down, and the line above them names
		* how many audits they actually cover rather than saying "recent".
		*
		* Read-only by design. The ledger is appended by the tools themselves; a browser
		* tab has no business writing a verdict it did not compute.
		*/
		/** How many entries the ledger is asked for; the host caps at 2000. */
		const LEDGER_LIMIT = 200;
		/**
		* A stable key for one entry.
		*
		* Deliberately not the array index: the list is refetched whenever the operator
		* hits refresh, and an index-keyed row would silently transfer its expanded state
		* to whatever entry slid into that position.
		* @param entry - the ledger row.
		* @returns the key.
		*/
		function keyOf(entry) {
			return `${entry.at}|${entry.tool}|${entry.label}|${entry.source}`;
		}
		/** 时间戳显示成本地短格式；空的就连破折号也不给，免得看着像一条真记录。 */
		function shortTime(at) {
			if (at === "") return "—";
			const date = new Date(at);
			if (Number.isNaN(date.getTime())) return at;
			const pad = (n) => String(n).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
		}
		/** 百分比；null 显示破折号。 */
		function percent(value) {
			return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
		}
		/**
		* The mark on an empty or still-loading pane — the same gauge as the panel entry,
		* larger, so an empty surface still says what it is a surface *of*.
		* @returns the decorative svg.
		*/
		function EmptyMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "28",
				height: "28",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.6 12.2a5.6 5.6 0 0 1 10.8 0",
						stroke: "currentColor",
						strokeWidth: "1",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 12.2 10.9 8.6",
						stroke: "currentColor",
						strokeWidth: "1",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3.1 13.6h9.8",
						stroke: "currentColor",
						strokeWidth: "1",
						strokeLinecap: "round"
					})
				]
			});
		}
		/**
		* Render the ledger dialog.
		* @param props - composed slot props.
		* @returns the dialog.
		*/
		function DigestManager({ summary, onClose, t }) {
			const [data, setData] = (0, react.useState)(void 0);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [filter, setFilter] = (0, react.useState)("all");
			const [openKey, setOpenKey] = (0, react.useState)(void 0);
			const [helpOpen, setHelpOpen] = (0, react.useState)(false);
			const load = (0, react.useCallback)(async () => {
				setBusy(true);
				try {
					setData(await summary(LEDGER_LIMIT));
					setFailure(void 0);
				} catch (error) {
					setFailure(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy(false);
				}
			}, [summary]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const head = data?.summary;
			const counts = head?.byOutcome ?? {};
			const averages = head?.averages ?? {};
			const all = head?.recent ?? [];
			const rows = (0, react.useMemo)(() => filter === "all" ? all : all.filter((entry) => entry.outcome === filter), [all, filter]);
			const loading = data === void 0 && busy;
			const tally = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default$3.tallyItem,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default$3.tallyNum,
							children: head?.total ?? 0
						}),
						" ",
						t("digest.tallyTotal")
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default$3.tallySep,
					"aria-hidden": "true",
					children: "·"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default$3.tallyItem,
					title: t("digest.aboutAudit"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$3.tallyNum, panel_module_css_default$3.tonePass),
							children: counts.pass ?? 0
						}),
						" ",
						t("digest.tallyPass")
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default$3.tallySep,
					"aria-hidden": "true",
					children: "·"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default$3.tallyItem,
					title: t("digest.aboutAudit"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$3.tallyNum, panel_module_css_default$3.toneFail),
							children: counts.fail ?? 0
						}),
						" ",
						t("digest.tallyFail")
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default$3.tallySep,
					"aria-hidden": "true",
					children: "·"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default$3.tallyItem,
					title: t("digest.aboutPlan"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default$3.tallyNum,
							children: counts.plan ?? 0
						}),
						" ",
						t("digest.tallyPlan")
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default$3.tallySep,
					"aria-hidden": "true",
					children: "·"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default$3.tallyItem,
					title: t("digest.aboutGate"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default$3.tallyNum,
							children: counts.gate ?? 0
						}),
						" ",
						t("digest.tallyGate")
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default$3.tallySep,
					"aria-hidden": "true",
					children: "·"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default$3.tallyItem,
					title: t("digest.aboutSweep"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default$3.tallyNum,
							children: counts.sweep ?? 0
						}),
						" ",
						t("digest.tallySweep")
					]
				})
			] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("digest.title"),
				closeLabel: t("digest.close"),
				className: cn(panel_module_css_default$5.manager),
				contentClassName: cn(panel_module_css_default$5.managerContent),
				children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: cn(panel_module_css_default$5.error),
					role: "alert",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.errorText),
						children: t("digest.actionFailed", { message: failure })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$5.errorAction),
						onClick: () => {
							load();
						},
						children: t("digest.retry")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: cn(panel_module_css_default$5.body, panel_module_css_default$3.body),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: cn(panel_module_css_default$5.detailPane),
						"aria-label": t("digest.title"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default$3.toolbar,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$3.tally, loading ? panel_module_css_default$3.dim : void 0),
									children: tally
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default$3.actions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default$3.filters,
											role: "group",
											"aria-label": t("digest.filterAll"),
											children: [
												"all",
												"fail",
												"pass"
											].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: cn(panel_module_css_default$3.filter, filter === value ? panel_module_css_default$3.filterOn : void 0),
												"aria-pressed": filter === value,
												onClick: () => {
													setFilter(value);
												},
												children: value === "all" ? t("digest.filterAll") : value === "fail" ? t("digest.filterFail") : t("digest.filterPass")
											}, value))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: cn(panel_module_css_default$3.helpToggle, helpOpen ? panel_module_css_default$3.helpToggleOn : void 0),
											"aria-pressed": helpOpen,
											"aria-controls": "digest-help",
											onClick: () => {
												setHelpOpen((value) => !value);
											},
											children: [
												helpOpen ? "×" : "?",
												" ",
												t("digest.helpToggle")
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											disabled: busy,
											onClick: () => {
												load();
											},
											children: busy ? t("digest.loading") : t("digest.refresh")
										})
									]
								})]
							}),
							helpOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default$3.help,
								id: "digest-help",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default$3.helpBody,
										children: t("digest.helpIntro")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
										className: panel_module_css_default$3.helpList,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.tallyPlan") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("digest.helpAboutPlan") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.tallyGate") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("digest.helpAboutGate") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: `${t("digest.tallyPass")} / ${t("digest.tallyFail")}` }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("digest.helpAboutAudit") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.tallySweep") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("digest.helpAboutSweep") })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default$3.helpBody,
										children: t("digest.helpThreshold")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: panel_module_css_default$3.helpMetrics,
										children: METRIC_ORDER.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: METRIC_LABELS[key] ?? key }),
											" — ",
											t(METRIC_ABOUT_KEYS[key] ?? "digest.noSample")
										] }, key))
									})
								]
							}),
							(head?.averagedOver ?? 0) === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default$3.sectionNote,
								children: t("digest.averageNone")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default$3.sectionNote,
								children: t("digest.averageHint", { count: head?.averagedOver ?? 0 })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default$3.averageGrid,
								children: METRIC_ORDER.map((key) => {
									const value = averages[key];
									const shown = typeof value === "number";
									const ratio = shown ? Math.max(.02, Math.min(1, value)) : 0;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default$3.averageCell,
										"data-empty": shown ? void 0 : "",
										title: t(METRIC_ABOUT_KEYS[key] ?? "digest.noSample"),
										style: { "--bar-ratio": String(ratio) },
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default$3.averageLabel,
												children: METRIC_LABELS[key] ?? key
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default$3.averageValue,
												children: percent(value ?? null)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default$3.averageBar,
												"aria-hidden": "true"
											})
										]
									}, key);
								})
							})] }),
							loading || rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$5.empty),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.emptyMark),
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyMark, {})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.emptyTitle),
									children: loading ? t("digest.loadingList") : all.length === 0 ? t("digest.empty") : t("digest.emptyFiltered")
								})]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: panel_module_css_default$3.logList,
								children: rows.map((entry) => {
									const key = keyOf(entry);
									const open = openKey === key;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: panel_module_css_default$3.logRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: panel_module_css_default$3.logHead,
											"aria-expanded": open,
											onClick: () => {
												setOpenKey(open ? void 0 : key);
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default$3.logTime,
													children: shortTime(entry.at)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default$3.logLine,
													children: entryLine(entry)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: cn(panel_module_css_default$5.tag, entry.outcome === "pass" ? panel_module_css_default$5.tagPass : entry.outcome === "fail" ? panel_module_css_default$5.tagFail : void 0),
													children: OUTCOME_LABELS[entry.outcome] ?? entry.outcome
												})
											]
										}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default$3.logDetail,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
													className: panel_module_css_default$3.detailGrid,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.fieldLabel") }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: entry.label === "" ? "—" : entry.label }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.fieldSource") }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
															className: panel_module_css_default$3.mono,
															children: entry.source
														}),
														entry.product !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.fieldProduct") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
															className: panel_module_css_default$3.mono,
															children: entry.product
														})] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.fieldSize") }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${(entry.sourceBytes / 1024).toFixed(0)} KB → ${(entry.productBytes / 1024).toFixed(1)} KB` }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("digest.fieldMs") }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${entry.ms} ms` })
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default$3.metricStrip,
													children: METRIC_ORDER.map((metric) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default$5.tag,
														children: `${METRIC_LABELS[metric] ?? metric} ${percent(entry.metrics[metric] ?? null)}`
													}, metric))
												}),
												entry.failed.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: panel_module_css_default$3.failedLine,
													children: `${t("digest.failedItems")}${entry.failed.join("、")}`
												})
											]
										})]
									}, key);
								})
							}),
							data !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: panel_module_css_default$3.foot,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("digest.logAt") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default$3.mono,
										children: data.path
									}),
									all.length < (head?.total ?? 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("digest.showing", {
										shown: all.length,
										total: head?.total ?? 0
									}) }),
									head?.since !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default$3.footSince,
										children: t("digest.since", { at: shortTime(head.since) })
									})
								]
							})
						]
					})
				})]
			});
		}
		//#endregion
		//#region src/client/DigestItem.tsx
		/**
		* The panel's fifth built-in entry: one row that opens the digestion ledger.
		*
		* Same gestures as its four siblings — a dialog rather than a region of the 280px
		* strip, the panel's own dismissals standing down while it is up, and focus handed
		* back to the row on close. The mark, the name it is given, and the surface
		* differ.
		*/
		/**
		* The entry's glyph: a gauge with its needle — a reading, which is what this
		* surface is. Drawn here rather than imported so the mark does not track one
		* harness release's icon set.
		* @returns the decorative svg.
		*/
		function DigestMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.6 12.2a5.6 5.6 0 0 1 10.8 0",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 12.2 10.9 8.6",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3.1 13.6h9.8",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					})
				]
			});
		}
		/**
		* Render the entry row and, while open, the ledger surface.
		* @param props - composed slot props.
		* @returns the row, plus the dialog when it is showing.
		*/
		function DigestItem({ t, label, pushOverlay, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const announce = (0, react.useRef)(pushOverlay);
			announce.current = pushOverlay;
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				const release = announce.current();
				return () => {
					release();
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: panel_item_module_css_default.item,
				"data-active": open ? "" : void 0,
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen((value) => !value);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DigestMark, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.label,
					children: label
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DigestManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\home\panel.module.css.mjs
		const css$3 = ".z40_Xq_title{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:0 0 6px;font-size:14px;font-weight:600;display:flex}.z40_Xq_subTitle{color:var(--dsw-alias-label-secondary);margin:18px 0 6px;font-size:12px;font-weight:600}.z40_Xq_rowNotReady{opacity:.55}.z40_Xq_mono{word-break:break-all;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.z40_Xq_pathRow{align-items:flex-start;gap:6px;display:flex}.z40_Xq_pathRow>button{white-space:nowrap;flex:none}.z40_Xq_pathField{flex:1}.z40_Xq_copyBtn{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;flex:none;padding:2px;line-height:0}.z40_Xq_copyBtn:hover{color:var(--dsw-alias-label-primary)}.z40_Xq_copyOk{color:var(--dsw-alias-state-success-primary)}.z40_Xq_copyBad{color:var(--dsw-alias-state-error-primary)}.z40_Xq_select{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);width:100%;height:28px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:8px;padding:0 6px;font-family:inherit;font-size:12px;line-height:18px}.z40_Xq_select:disabled{opacity:.5;cursor:not-allowed}.z40_Xq_keys{grid-template-columns:minmax(0,auto) minmax(0,1fr) auto;align-items:baseline;gap:4px 10px;font-size:12px;line-height:16px;display:grid}.z40_Xq_keyRole{color:var(--dsw-alias-label-tertiary)}.z40_Xq_keyRel{word-break:break-all;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.z40_Xq_keyState{white-space:nowrap;color:var(--dsw-alias-state-success-primary)}.z40_Xq_keyStateNo{white-space:nowrap;color:var(--dsw-alias-label-dimmed)}.z40_Xq_warnList{color:var(--dsw-alias-label-tertiary);flex-direction:column;gap:2px;margin:0;padding-left:18px;font-size:12px;line-height:16px;display:flex}";
		const tagId$3 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var panel_module_css_default$2 = {
			"copyBad": "z40_Xq_copyBad",
			"copyBtn": "z40_Xq_copyBtn",
			"copyOk": "z40_Xq_copyOk",
			"keyRel": "z40_Xq_keyRel",
			"keyRole": "z40_Xq_keyRole",
			"keyState": "z40_Xq_keyState",
			"keyStateNo": "z40_Xq_keyStateNo",
			"keys": "z40_Xq_keys",
			"mono": "z40_Xq_mono",
			"pathField": "z40_Xq_pathField",
			"pathRow": "z40_Xq_pathRow",
			"rowNotReady": "z40_Xq_rowNotReady",
			"select": "z40_Xq_select",
			"subTitle": "z40_Xq_subTitle",
			"title": "z40_Xq_title",
			"warnList": "z40_Xq_warnList"
		};
		//#endregion
		//#region src/client/home/HomeManager.tsx
		/**
		* The installation surface: every registered Home on one side, and on the other
		* what that directory actually is — what the probe found, which standard paths it
		* has, and whether a class index exists for its version.
		*
		* ## Why this surface exists at all
		*
		* The registration is not for the panel's benefit. A Home path today reaches the
		* model only inside the sentence that asks for it, so every new conversation
		* starts by asking again. Registering one here puts it behind `ncc_home_list`,
		* and the same fact is mirrored into the skills' own `*_home_path.json` so
		* Claude Code's half of the toolchain reads it too.
		*
		* ## What the probe is, and is not
		*
		* A probe walks directory entries and counts what it sees. It does not open a
		* jar — `buildClassIndex` does, and that takes minutes. So the two numbers it
		* reports are counts of names, and when the walk hits its cap they are reported
		* as lower bounds (`capped`) rather than as figures that look precise and are
		* not. Nothing here builds an index either: this batch registers, probes and
		* reads, and the index line reports only whether a build already exists.
		*
		* Same shape as its five siblings, on purpose: the shared stylesheet carries the
		* pane split, the list, the property grid, the form rows, the action row, the
		* empty state and the error strip, and the dialog chrome comes from `Modal`.
		*
		* Nothing here fetches: every call arrives as a prop from the entry's inject
		* face, which is what keeps this file testable without the host.
		*/
		/** Below this many rows the list is short enough to read without a search box. */
		const SEARCH_THRESHOLD$2 = 8;
		/** How long a copy confirmation stays on screen. */
		const COPY_LINGER_MS$2 = 1600;
		/**
		* How often a running build is asked where it is.
		*
		* A build is ~3.6 s on the reference installation and reports every 200 files, so a tick
		* a second is enough to watch it move without the poll being the thing that costs.
		*/
		const META_POLL_MS = 1e3;
		/** Which translation key names each shape the probe can conclude. */
		const SHAPE_KEY = {
			"ncc-home": "home.shape.ncc-home",
			"bip-home": "home.shape.bip-home",
			"jar-collection": "home.shape.jar-collection",
			"not-found": "home.shape.not-found"
		};
		/** Which translation key names each product line. */
		const PRODUCT_KEY = {
			ncc: "home.product.ncc",
			bip: "home.product.bip"
		};
		/**
		* The version dropdown's escape-hatch entry.
		*
		* A closed list of six is a dead end the moment a seventh version ships, and it is
		* wrong by construction for the product line it does not mention. A sentinel rather
		* than an empty value, because "nothing picked yet" and "deliberately something not
		* on the list" are different states: the first should show the hint, the second
		* should show a text box.
		*/
		const OTHER_VERSION = "__other__";
		/**
		* A blank draft, or one seeded from an existing registration.
		*
		* No name: a Home is called `<产品线><版本>` (`homeLabelOf`), and the same version
		* registered against two projects describes the same set of classes, so a name would
		* only be a second identity to invent for a row that already has one.
		*/
		function draftOf(row) {
			if (row === void 0) return {
				path: "",
				product: "ncc",
				version: "",
				versionOther: false,
				isDefault: false
			};
			return {
				id: row.id,
				path: row.path,
				product: row.product,
				version: row.version,
				versionOther: !HOME_VERSIONS[row.product].some((option) => option.value === row.version),
				isDefault: row.isDefault
			};
		}
		/**
		* A byte count in the unit a person reads it in.
		* @param value - the size in bytes.
		* @returns the formatted size.
		*/
		function bytes$1(value) {
			if (value < 1024) return `${value} B`;
			if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
			return `${(value / 1048576).toFixed(1)} MB`;
		}
		/**
		* The mark in front of every row: the same house the entry cell uses.
		* @returns the decorative glyph.
		*/
		function HomeMark$1() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.5 7.1 8 2.6l5.5 4.5",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 7.4v5.6a.7.7 0 0 0 .7.7h6.6a.7.7 0 0 0 .7-.7V7.4",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M6.8 13.7V10h2.4v3.7",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					})
				]
			});
		}
		/**
		* The copy affordance, matching the field table's in the project surface.
		* @returns the decorative svg.
		*/
		function CopyMark$2() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "13",
				height: "13",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "5.75",
					y: "5.75",
					width: "7.5",
					height: "7.5",
					rx: "1.25",
					stroke: "currentColor",
					strokeWidth: "1.3"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.25 3.75H3.9c-.6 0-1.15.5-1.15 1.15v6.35",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round"
				})]
			});
		}
		/**
		* The confirmation that replaces it once the path is on the clipboard.
		* @returns the decorative svg.
		*/
		function CheckMark$2() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "13",
				height: "13",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 8.5l3 3 6-6.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/**
		* Render the installation surface.
		* @param props - injected API, copy seat, and close verb.
		* @returns the dialog.
		*/
		function HomeManager({ t, onClose, ...api }) {
			/**
			* The two members the effects below depend on, taken by name.
			*
			* The rest object is rebuilt on every render — the face arrives as a spread, so no
			* version of it outlives a render — which makes it unusable as a dependency: an
			* effect that lists it re-runs every time, and an effect that then stores a
			* freshly-read answer re-renders and runs again. That is a loop, not a slow list, and
			* it is what selecting a registered row did here: the index status came back as a new
			* object every time, the render it caused re-ran the effect, and the pane spun at 100%
			* CPU while the timer queue starved (the poll never ticked, the DOM never settled).
			* The members are the stable part — the apply world builds them once — so they are
			* what the dependency lists name. `WikiManager` and `DigestManager` read their APIs
			* the same way for the same reason.
			*/
			const { listHomes, metaStatus: readMetaStatus } = api;
			const [homes, setHomes] = (0, react.useState)([]);
			const [complete, setComplete] = (0, react.useState)(true);
			const [payloadError, setPayloadError] = (0, react.useState)();
			const [configPath, setConfigPath] = (0, react.useState)("");
			const [mirrorPath, setMirrorPath] = (0, react.useState)();
			const [mirrorWarning, setMirrorWarning] = (0, react.useState)();
			const [selected, setSelected] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)();
			const [query, setQuery] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)();
			const [probeNote, setProbeNote] = (0, react.useState)();
			/** What the metadata index endpoint last said about the selected Home. */
			const [metaStatus, setMetaStatus] = (0, react.useState)();
			/** True between pressing build and the request coming back — not while it runs. */
			const [metaBusy, setMetaBusy] = (0, react.useState)(false);
			const [confirmingRemove, setConfirmingRemove] = (0, react.useState)(false);
			/**
			* What the host says its chooser is, or undefined while it has not been asked.
			*
			* Not reset with the draft: the host's answer is a property of the machine, so
			* once known it holds for every form opened afterwards in this panel.
			*/
			const [pickerKind, setPickerKind] = (0, react.useState)();
			const [picking, setPicking] = (0, react.useState)(false);
			/** Whether copying the path worked, and the timer that clears the confirmation. */
			const [copied, setCopied] = (0, react.useState)(void 0);
			const copyTimer = (0, react.useRef)(void 0);
			const focusedOnce = (0, react.useRef)(false);
			const list = (0, react.useRef)(null);
			/** The progress poll, while a build is running. */
			const metaPoll = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
			}, []);
			const forget = (cause) => cause instanceof Error ? cause.message : String(cause);
			/** Read every registration, so save and probe land on what was actually stored. */
			const load = (0, react.useCallback)((keepId) => {
				setLoading(true);
				setFailure(void 0);
				return listHomes().then((payload) => {
					setHomes(payload.homes);
					setComplete(payload.complete);
					setPayloadError(payload.error);
					setConfigPath(payload.configPath);
					setMirrorPath(payload.mirrorPath);
					setMirrorWarning(payload.mirrorWarning);
					setSelected((previous) => {
						const wanted = keepId ?? previous;
						if (wanted !== void 0 && payload.homes.some((row) => row.id === wanted)) return wanted;
						return payload.homes[0]?.id;
					});
				}, (cause) => {
					setFailure(forget(cause));
				}).finally(() => {
					setLoading(false);
				});
			}, [listHomes]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			/** Run one mutation, then re-read so the list reflects what was stored. */
			const act = (work, keepId) => {
				(async () => {
					setBusy(true);
					setFailure(void 0);
					try {
						await work();
						await load(keepId);
					} catch (cause) {
						setFailure(forget(cause));
					} finally {
						setBusy(false);
					}
				})();
			};
			const current = homes.find((row) => row.id === selected);
			/** True while a build for the selected Home is actually running. */
			const metaRunning = metaStatus?.build?.running === true;
			/** Stop asking a running build where it is. */
			const stopMetaPoll = (0, react.useCallback)(() => {
				if (metaPoll.current !== void 0) {
					clearInterval(metaPoll.current);
					metaPoll.current = void 0;
				}
			}, []);
			/**
			* Follow a build until it stops, then take the full answer once.
			*
			* The ticks ask for the cheap form (`fresh=0`), because the fingerprint comparison
			* inside the full one walks the whole installation — 0.61 s per second of polling is
			* a disk scan nobody asked for. The fingerprint is worth taking exactly once, when the
			* build has stopped and the numbers it produces have stopped moving.
			*/
			const watchMeta = (0, react.useCallback)((id) => {
				stopMetaPoll();
				metaPoll.current = setInterval(() => {
					readMetaStatus(id, false).then((status) => {
						setMetaStatus(status);
						if (status.build?.running !== true) {
							stopMetaPoll();
							readMetaStatus(id, true).then(setMetaStatus, () => void 0);
						}
					}, () => {
						stopMetaPoll();
					});
				}, META_POLL_MS);
			}, [readMetaStatus, stopMetaPoll]);
			(0, react.useEffect)(() => () => {
				stopMetaPoll();
			}, [stopMetaPoll]);
			(0, react.useEffect)(() => {
				stopMetaPoll();
				const id = current?.id;
				if (id === void 0) {
					setMetaStatus(void 0);
					return;
				}
				let live = true;
				readMetaStatus(id, true).then((status) => {
					if (!live) return;
					setMetaStatus(status);
					if (status.build?.running === true) watchMeta(id);
				}, () => {
					if (live) setMetaStatus(void 0);
				});
				return () => {
					live = false;
				};
			}, [
				readMetaStatus,
				current?.id,
				stopMetaPoll,
				watchMeta
			]);
			/**
			* Start a build. Deliberately not through `act`: `act` raises `busy`, which disables
			* every control in the pane — right for a save that finishes in milliseconds, wrong for
			* a build that runs for seconds and whose whole point is that you can watch it.
			*/
			const buildMeta = (row) => {
				setMetaBusy(true);
				setFailure(void 0);
				(async () => {
					try {
						const answer = await api.buildMeta(row.id);
						setMetaStatus(answer.status);
						if (answer.status.build?.running === true || answer.started) watchMeta(row.id);
					} catch (cause) {
						setFailure(forget(cause));
					} finally {
						setMetaBusy(false);
					}
				})();
			};
			/** Save the open draft, then select whatever it produced. */
			const save = () => {
				const open = draft;
				if (open === void 0) return;
				const body = {
					path: open.path.trim(),
					product: open.product,
					version: open.version.trim(),
					isDefault: open.isDefault
				};
				act(async () => {
					const saved = await api.saveHome(open.id, body);
					setDraft(void 0);
					setProbeNote(void 0);
					await load(saved.id);
				}, open.id);
			};
			/** Walk the directory again and store what is there now. */
			const probe = (row) => {
				setProbeNote(void 0);
				act(async () => {
					const profile = (await api.probeHome(row.id)).profile;
					setProbeNote(profile === void 0 ? t("home.never") : profile.capped ? t("home.probedCapped", { shape: t(SHAPE_KEY[profile.shape]) }) : t("home.probed", {
						shape: t(SHAPE_KEY[profile.shape]),
						modules: profile.modules,
						jars: profile.jars
					}));
					await load(row.id);
				}, row.id);
			};
			/**
			* Open the host's folder chooser and take the directory it returns.
			*
			* The picker is asked lazily — on a click, not on mount — because asking is what
			* opens the dialog: there is no way to learn the host's kind without it. So the
			* button is what a fresh form shows, and a host that cannot back it is discovered
			* once and never again in this panel.
			*
			* Cancelling is a normal answer (`path: null`), not a failure: the field keeps
			* what it had. A host with no chooser is not a failure either — the form says so
			* under the field. There is no text box to fall back to: a typed path is exactly
			* the thing this field stops being able to be wrong about.
			*/
			const choosePath = () => {
				(async () => {
					setPicking(true);
					try {
						const answer = await api.pickPath();
						setPickerKind(answer.kind);
						const chosen = answer.kind === "native" && typeof answer.path === "string" ? answer.path : "";
						if (chosen !== "") setDraft((open) => open === void 0 ? open : {
							...open,
							path: chosen
						});
					} catch (cause) {
						setFailure(forget(cause));
					} finally {
						setPicking(false);
					}
				})();
			};
			/** Put the Home path on the clipboard, since it is a machine fact people paste. */
			const copyPath = (value) => {
				const settle = (outcome) => {
					setCopied(outcome);
					if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
					copyTimer.current = setTimeout(() => {
						setCopied(void 0);
					}, COPY_LINGER_MS$2);
				};
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(value).then((accepted) => {
					settle(accepted ? "copied" : "failed");
				}, () => {
					settle("failed");
				});
			};
			(0, react.useEffect)(() => {
				if (loading || focusedOnce.current) return;
				focusedOnce.current = true;
				list.current?.querySelector("[role=\"option\"][tabindex=\"0\"]")?.focus();
			}, [loading]);
			const needle = query.trim().toLowerCase();
			const visible = needle === "" ? homes : homes.filter((row) => row.label.toLowerCase().includes(needle) || row.path.toLowerCase().includes(needle) || row.version.toLowerCase().includes(needle));
			const tabbableId = selected ?? visible[0]?.id;
			/** A timestamp as a person reads it, since the probe stores ISO. */
			const when = (iso) => iso.slice(0, 19).replace("T", " ");
			const row = (home) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "option",
				"aria-selected": home.id === selected,
				tabIndex: home.id === tabbableId ? 0 : -1,
				className: cn(panel_module_css_default$5.projectRow, !home.ready ? panel_module_css_default$2.rowNotReady : void 0),
				"data-key": home.id,
				onClick: () => {
					setSelected(home.id);
					setDraft(void 0);
					setProbeNote(void 0);
					setConfirmingRemove(false);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectMark),
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HomeMark$1, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectName),
						title: home.label,
						children: home.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectMeta),
						children: home.isDefault ? t("home.defaultTag") : ""
					})
				]
			}) }, home.id);
			/** The probe's reading: shape, the two counts, and the standard-path table. */
			const probeBlock = (home) => {
				const profile = home.profile;
				if (profile === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("home.never")
				});
				const atLeast = profile.capped ? t("home.atLeast") : "";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.note),
						children: t("home.probedAt", { at: when(profile.probedAt) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: cn(panel_module_css_default$5.props),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
								className: cn(panel_module_css_default$5.propLabel),
								children: t("home.shape")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								className: cn(panel_module_css_default$5.propValue),
								children: t(SHAPE_KEY[profile.shape])
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
								className: cn(panel_module_css_default$5.propLabel),
								children: t("home.modules")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								className: cn(panel_module_css_default$5.propValue),
								children: `${atLeast}${profile.modules}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
								className: cn(panel_module_css_default$5.propLabel),
								children: t("home.jars")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								className: cn(panel_module_css_default$5.propValue),
								children: `${atLeast}${profile.jars}`
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						className: cn(panel_module_css_default$2.subTitle),
						children: t("home.keyPaths")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: cn(panel_module_css_default$2.keys),
						children: profile.keys.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$2.keyRole),
								children: key.role
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$2.keyRel),
								children: key.rel
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(key.exists ? panel_module_css_default$2.keyState : panel_module_css_default$2.keyStateNo),
								children: key.exists ? t("home.keyYes") : t("home.keyNo")
							})
						] }, key.rel))
					}),
					profile.warnings.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: cn(panel_module_css_default$2.warnList),
						children: profile.warnings.map((warning) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: warning }, warning))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.note),
						children: t("home.probeNote")
					})
				] });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("home.title"),
				closeLabel: t("home.close"),
				className: cn(panel_module_css_default$5.manager),
				contentClassName: cn(panel_module_css_default$5.managerContent),
				children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: cn(panel_module_css_default$5.error),
					role: "alert",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.errorText),
						children: t("home.actionFailed", { message: failure })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$5.errorAction),
						onClick: () => {
							load();
						},
						children: t("home.retry")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default$5.body),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: cn(panel_module_css_default$5.listPane),
						"aria-label": t("home.list"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$5.listHead),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.listTitle),
									children: t("home.list")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									disabled: busy,
									onClick: () => {
										setDraft(draftOf());
										setProbeNote(void 0);
										setConfirmingRemove(false);
									},
									children: t("home.new")
								})]
							}),
							homes.length >= SEARCH_THRESHOLD$2 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								type: "search",
								className: cn(panel_module_css_default$5.inputFill),
								"aria-label": t("home.search"),
								placeholder: t("home.search"),
								value: query,
								onChange: (event) => {
									setQuery(event.target.value);
								}
							}),
							!complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: t("home.loadFailed", { message: payloadError ?? "" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								ref: list,
								className: cn(panel_module_css_default$5.projects),
								role: "listbox",
								"aria-label": t("home.list"),
								children: visible.map(row)
							}),
							needle !== "" && visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: t("home.searchEmpty", { query: query.trim() })
							}),
							needle !== "" && visible.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: t("home.showing", {
									shown: visible.length,
									total: homes.length
								})
							}),
							configPath !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: cn(panel_module_css_default$5.note),
								title: configPath,
								children: [
									t("home.configPath"),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$2.mono),
										children: configPath
									})
								]
							}),
							mirrorPath !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: cn(panel_module_css_default$5.note),
								title: mirrorPath,
								children: [
									t("home.mirror"),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$2.mono),
										children: mirrorPath
									})
								]
							}),
							mirrorWarning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								role: "status",
								children: t("home.mirrorWarn", { message: mirrorWarning })
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: cn(panel_module_css_default$5.detailPane),
						children: draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							className: cn(panel_module_css_default$5.form),
							onSubmit: (event) => {
								event.preventDefault();
								save();
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: cn(panel_module_css_default$2.title),
									children: draft.id === void 0 ? t("home.newTitle") : t("home.editTitle")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.hint),
									children: draft.id === void 0 ? t("home.createHint") : t("home.editHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.formRow),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-home-path",
											children: t("home.pathLabel")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: cn(panel_module_css_default$2.pathRow),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												id: "yon-home-path",
												className: cn(panel_module_css_default$5.inputFill, panel_module_css_default$2.pathField),
												value: draft.path,
												readOnly: true,
												placeholder: t("home.pathNone")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												type: "button",
												size: "sm",
												variant: "outline",
												disabled: busy || picking,
												onClick: choosePath,
												children: picking ? t("home.picking") : t("home.pickDir")
											})]
										}),
										pickerKind !== void 0 && pickerKind !== "native" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: cn(panel_module_css_default$5.hint),
											children: t("home.pickUnavailable")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.formRow),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: cn(panel_module_css_default$5.formLabel),
										htmlFor: "yon-home-product",
										children: t("home.product")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										id: "yon-home-product",
										className: cn(panel_module_css_default$2.select),
										value: draft.product,
										disabled: draft.id !== void 0,
										onChange: (event) => {
											const product = event.target.value === "bip" ? "bip" : "ncc";
											const keeps = HOME_VERSIONS[product].some((option) => option.value === draft.version);
											setDraft({
												...draft,
												product,
												...keeps ? {} : {
													version: "",
													versionOther: false
												}
											});
										},
										children: HOME_PRODUCTS.map((product) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: product,
											children: t(PRODUCT_KEY[product])
										}, product))
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.formRow),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: cn(panel_module_css_default$5.formLabel),
											htmlFor: "yon-home-version",
											children: t("home.version")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											id: "yon-home-version",
											className: cn(panel_module_css_default$2.select),
											value: draft.versionOther ? OTHER_VERSION : draft.version,
											disabled: draft.id !== void 0,
											onChange: (event) => {
												const chosen = event.target.value;
												setDraft(chosen === OTHER_VERSION ? {
													...draft,
													version: "",
													versionOther: true
												} : {
													...draft,
													version: chosen,
													versionOther: false
												});
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													disabled: true,
													children: t("home.versionPick")
												}),
												HOME_VERSIONS[draft.product].map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: option.value,
													children: option.label
												}, option.value)),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: OTHER_VERSION,
													children: t("home.versionOther")
												})
											]
										}),
										draft.versionOther && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											id: "yon-home-version-text",
											className: cn(panel_module_css_default$5.inputFill),
											value: draft.version,
											disabled: draft.id !== void 0,
											placeholder: t("home.versionPlaceholder"),
											onChange: (event) => {
												setDraft({
													...draft,
													version: event.target.value
												});
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: cn(panel_module_css_default$5.hint),
											children: t("home.versionHint")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: cn(panel_module_css_default$5.archivedToggle),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: draft.isDefault,
										onChange: (event) => {
											setDraft({
												...draft,
												isDefault: event.target.checked
											});
										}
									}), t("home.setDefault")]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.detailActions),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "submit",
										size: "sm",
										disabled: busy,
										children: busy ? t("home.saving") : t("home.save")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "button",
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => {
											setDraft(void 0);
										},
										children: t("home.cancel")
									})]
								})
							]
						}) : current === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$5.empty),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.emptyMark),
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HomeMark$1, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.emptyTitle),
									children: loading ? t("home.loading") : homes.length === 0 ? t("home.empty") : t("home.pickOne")
								}),
								homes.length === 0 && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("home.emptyWhy")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("home.emptyHow")
								})] })
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
								className: cn(panel_module_css_default$2.title),
								children: [current.label, current.isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.tagMuted),
									children: t("home.defaultTag")
								})]
							}),
							!current.ready && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: t("home.notReady")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: cn(panel_module_css_default$5.props),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("home.path")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: cn(panel_module_css_default$2.pathRow),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$2.mono),
												children: current.path
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: cn(panel_module_css_default$2.copyBtn, copied === "copied" ? panel_module_css_default$2.copyOk : void 0, copied === "failed" ? panel_module_css_default$2.copyBad : void 0),
												"aria-label": copied === "copied" ? t("home.copied") : copied === "failed" ? t("home.copyFailed") : t("home.copy"),
												title: t("home.copy"),
												onClick: () => {
													copyPath(current.path);
												},
												children: copied === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckMark$2, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyMark$2, {})
											})]
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("home.product")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: t(PRODUCT_KEY[current.product])
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("home.indexTitle")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: current.index === void 0 ? t("home.indexNone") : t("home.indexLine", {
											classes: current.index.totalClasses,
											size: bytes$1(current.index.bytes),
											at: when(current.index.builtAt)
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("home.metaTitle")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: cn(panel_module_css_default$2.pathRow),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: metaStatus === void 0 || metaStatus.indexed !== true ? t("home.metaNone") : t("home.metaLine", {
													entities: metaStatus.counts?.entities ?? 0,
													fields: metaStatus.counts?.fields ?? 0,
													enums: metaStatus.counts?.enums ?? 0,
													size: bytes$1(metaStatus.bytes ?? 0),
													at: when(metaStatus.builtAt ?? "")
												}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: metaBusy || metaRunning,
													onClick: () => {
														buildMeta(current);
													},
													children: metaRunning ? t("home.metaBuilding") : metaStatus?.indexed === true ? t("home.metaRebuild") : t("home.metaBuild")
												})]
											}),
											metaStatus?.build !== void 0 && metaRunning && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: cn(panel_module_css_default$5.note),
												role: "status",
												children: t("home.metaProgress", {
													parsed: metaStatus.build.parsed,
													total: metaStatus.build.total,
													files: metaStatus.build.files
												})
											}),
											metaStatus?.build?.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: cn(panel_module_css_default$5.note),
												role: "alert",
												children: t("home.metaFailed", { error: metaStatus.build.error })
											}),
											metaStatus?.freshness !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: cn(panel_module_css_default$5.note),
												children: metaStatus.freshness.state === "fresh" ? t("home.metaFresh") : t("home.metaStale", {
													changed: metaStatus.freshness.changed,
													added: metaStatus.freshness.added,
													removed: metaStatus.freshness.removed
												})
											}),
											(metaStatus?.sourceHomes?.length ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
												className: cn(panel_module_css_default$5.note),
												children: [
													t("home.metaFrom"),
													" ",
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: cn(panel_module_css_default$2.mono),
														children: (metaStatus?.sourceHomes ?? []).join("  ·  ")
													})
												]
											}),
											metaStatus === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: cn(panel_module_css_default$5.note),
												children: t("home.metaWhy")
											})
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								className: cn(panel_module_css_default$2.subTitle),
								children: t("home.probeTitle")
							}),
							probeBlock(current),
							probeNote !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								role: "status",
								children: probeNote
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$5.detailActions),
								children: [
									confirmingRemove && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: cn(panel_module_css_default$5.note),
										children: [
											t("home.removeAsk"),
											" ",
											t("home.removeAbout")
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										disabled: busy,
										onClick: () => {
											probe(current);
										},
										children: busy ? t("home.probing") : t("home.probe")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy || current.isDefault,
										onClick: () => {
											act(async () => {
												await api.setDefaultHome(current.id);
											}, current.id);
										},
										children: t("home.makeDefault")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => {
											setDraft(draftOf(current));
											setProbeNote(void 0);
										},
										children: t("home.edit")
									}),
									confirmingRemove ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										className: cn(panel_module_css_default$5.dangerButton),
										disabled: busy,
										onClick: () => {
											const target = current.id;
											setConfirmingRemove(false);
											act(async () => {
												await api.removeHome(target);
												setSelected(void 0);
											});
										},
										children: t("home.removeYes")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => {
											setConfirmingRemove(false);
										},
										children: t("home.cancel")
									})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										className: cn(panel_module_css_default$5.dangerButton),
										disabled: busy,
										onClick: () => {
											setConfirmingRemove(true);
										},
										children: t("home.remove")
									})
								]
							})
						] })
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/HomeItem.tsx
		/**
		* The panel's sixth built-in entry: one row that opens the installation surface.
		*
		* Same gestures as its five siblings — a dialog rather than a region of the 280px
		* strip, the panel's own dismissals standing down while it is up, and focus handed
		* back to the row on close. The mark, the name it is given, and the surface differ.
		*/
		/**
		* The entry's glyph: a house — the directory an installation lives in, which is
		* the whole of what this surface registers. Drawn here rather than imported so
		* the mark does not track one harness release's icon set.
		* @returns the decorative svg.
		*/
		function HomeMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.5 7.1 8 2.6l5.5 4.5",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 7.4v5.6a.7.7 0 0 0 .7.7h6.6a.7.7 0 0 0 .7-.7V7.4",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M6.8 13.7V10h2.4v3.7",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					})
				]
			});
		}
		/**
		* Render the entry row and, while open, the installation surface.
		* @param props - composed slot props.
		* @returns the row, plus the dialog when it is showing.
		*/
		function HomeItem({ t, label, pushOverlay, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const announce = (0, react.useRef)(pushOverlay);
			announce.current = pushOverlay;
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				const release = announce.current();
				return () => {
					release();
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: panel_item_module_css_default.item,
				"data-active": open ? "" : void 0,
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen((value) => !value);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(HomeMark, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.label,
					children: label
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HomeManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region src/client/project/useComposing.ts
		/**
		* The Enter that confirms an input-method composition is not a submit.
		*
		* Every text field in this surface submits on Enter, and the operators are
		* typing Chinese: pressing Enter to pick a pinyin candidate is the normal way to
		* finish a word, not a request to create a project whose name is the half-typed
		* "环境信". A key event carries no reliable cross-browser "this Enter was mine"
		* flag on its own, so the guard tracks the composition window itself and also
		* honours the native flag when the browser does set it.
		*/
		/**
		* Track one input's composition window.
		* @returns the composition handlers and the Enter guard.
		*/
		function useComposingGuard() {
			const composing = (0, react.useRef)(false);
			return (0, react.useMemo)(() => ({
				onCompositionStart: () => {
					composing.current = true;
				},
				onCompositionEnd: () => {
					composing.current = false;
				},
				isComposing: (event) => composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
			}), []);
		}
		//#endregion
		//#region src/client/project/CreateProjectDialog.tsx
		/**
		* Creating a project is one short form, so it happens in the framework's own
		* dialog: a mask to hold attention, Escape and the close button to leave, and
		* the page's focus returned to whatever opened it.
		*
		* The dialog owns its draft and its own failure text; the caller owns the call
		* and the decision to close, because only the caller knows what a created
		* project means to the rest of the surface.
		*/
		/**
		* Render the create-project dialog.
		* @param props - open state, copy, cancel and create verbs.
		* @returns the dialog, or nothing while it is closed.
		*/
		function CreateProjectDialog({ open, t, onCancel, onCreate }) {
			const guard = useComposingGuard();
			const [name, setName] = (0, react.useState)("");
			const [code, setCode] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				if (!open) return;
				setName("");
				setCode("");
				setError(void 0);
				setBusy(false);
			}, [open]);
			const submit = () => {
				const trimmed = name.trim();
				if (trimmed === "" || busy) return;
				setBusy(true);
				setError(void 0);
				onCreate({
					name: trimmed,
					code: code.trim()
				}).catch((failure) => {
					setError(failure instanceof Error ? failure.message : String(failure));
				}).finally(() => {
					setBusy(false);
				});
			};
			const onEnter = (event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				submit();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: onCancel,
				title: t("project.createTitle"),
				closeLabel: t("project.cancel"),
				description: t("project.createHint"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: busy,
					onClick: onCancel,
					children: t("project.cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || name.trim() === "",
					onClick: submit,
					children: busy ? t("project.createBusy") : t("project.createConfirm")
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default$5.form),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$5.formRow),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.formLabel),
								children: t("project.name")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$5.inputFill),
								"aria-label": t("project.name"),
								placeholder: t("project.namePlaceholder"),
								value: name,
								autoFocus: true,
								disabled: busy,
								onChange: (event) => {
									setName(event.target.value);
								},
								onCompositionStart: guard.onCompositionStart,
								onCompositionEnd: guard.onCompositionEnd,
								onKeyDown: (event) => {
									if (guard.isComposing(event)) return;
									onEnter(event);
								}
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$5.formRow),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.formLabel),
								children: t("project.code")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$5.inputFill),
								"aria-label": t("project.code"),
								placeholder: t("project.codePlaceholder"),
								value: code,
								disabled: busy,
								onChange: (event) => {
									setCode(event.target.value);
								},
								onCompositionStart: guard.onCompositionStart,
								onCompositionEnd: guard.onCompositionEnd,
								onKeyDown: (event) => {
									if (guard.isComposing(event)) return;
									onEnter(event);
								}
							})]
						}),
						error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: cn(panel_module_css_default$5.formError),
							role: "alert",
							children: t("project.actionFailed", { message: error })
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/project/FieldTable.tsx
		/**
		* The dynamic fields of one project: one editable row per field, plus the row
		* that adds the next one.
		*
		* Two decisions are worth stating. A value saves when the row loses focus, so
		* typing stays cheap; the row - never the whole table - carries the result, so
		* a failure is reported where the operator is looking and never blocks the row
		* they moved on to. And a value is only parsed as JSON when it looks structured:
		* reading `13800138000` as a number would quietly round a phone number, so plain
		* text stays text.
		*
		* A value is read as text and becomes an input only once it is clicked. A value
		* can be long - a whole 联调记录, a whole connection string - and a box that is
		* always an input hides the tail of it behind the cursor; read as text it wraps
		* and shows itself. Structured values (an object, an array, or a JSON *string*,
		* which is how the real stores hold a datasource config) are read as a key-value
		* list rather than a blob of JSON; only a container nested deeper than one level
		* falls back to indented JSON. Editing always starts from the text that is
		* stored, so an edit that changes nothing writes nothing.
		*
		* Removing a field asks first, in the same small dialog the rest of the product
		* uses for a destructive act; the row's own cross only opens it.
		*/
		/** How long the "saved" note stays on a row before the row goes quiet again. */
		const SAVED_LINGER_MS = 1600;
		/** How long the copy button holds its result before going quiet again. */
		const COPY_LINGER_MS$1 = 1600;
		/**
		* The copy glyph: two offset frames, drawn here rather than imported so the mark
		* does not track one harness release's icon names.
		* @returns the decorative svg.
		*/
		function CopyMark$1() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "5.5",
					y: "5.5",
					width: "9",
					height: "9",
					rx: "2",
					stroke: "currentColor",
					strokeWidth: "1.2"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.5 3.5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round"
				})]
			});
		}
		/**
		* The copy button's outcome glyph.
		* @returns the decorative svg.
		*/
		function CheckMark$1() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 8.5l3 3 6-7",
					stroke: "currentColor",
					strokeWidth: "1.6",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/**
		* Render a stored value into its editable text.
		* @param value - stored value.
		* @returns text the operator can edit; objects and arrays stay JSON.
		*/
		function formatValue(value) {
			return typeof value === "string" ? value : JSON.stringify(value);
		}
		/**
		* Read edited text back into a value.
		* @param text - what the operator typed.
		* @returns the parsed value for structured JSON, otherwise the text itself.
		*/
		function parseValue(text) {
			const trimmed = text.trim();
			if (trimmed === "") return "";
			if (!(trimmed.startsWith("{") || trimmed.startsWith("[")) && !(trimmed === "true" || trimmed === "false" || trimmed === "null")) return text;
			try {
				return JSON.parse(trimmed);
			} catch {
				return text;
			}
		}
		/**
		* What an array entry shows in the key column. Not an index: `0` and `1` read
		* like data, while this mark only says "here is one of them".
		*/
		const FIELD_ITEM_MARK = "·";
		/**
		* Read a value as a container, or `undefined` when it is not one.
		*
		* Two sources, and the second is the one that matters in practice: the value is
		* an object or an array, or the value is a *string* that looks like JSON. The
		* panel stores JSON when it can parse it, but a value typed by hand into the
		* store - a datasource config, a password vault entry - arrives as one long
		* string, and dumping that string into a row is exactly the report this fixes.
		* @param value - stored value.
		* @returns the container, or `undefined` for anything read as plain text.
		*/
		function asContainer(value) {
			if (value !== null && typeof value === "object") return value;
			if (typeof value !== "string") return void 0;
			const trimmed = value.trim();
			if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return void 0;
			try {
				const parsed = JSON.parse(trimmed);
				return parsed !== null && typeof parsed === "object" ? parsed : void 0;
			} catch {
				return;
			}
		}
		/**
		* The key-value pairs of a flat container, or `undefined` once it nests.
		*
		* A nest deeper than one level falls back to JSON rather than indenting: this
		* grid is where a value is glanced at, and an indented key-value list two levels
		* down is harder to read than the JSON it came from. Whoever wants structure has
		* the knowledge panel's tree.
		* @param container - the value read as a container.
		* @returns one row per entry, or `undefined` when any entry is itself a container.
		*/
		function flatPairs(container) {
			const items = Array.isArray(container) ? container.map((item, index) => [String(index), item]) : Object.entries(container);
			const rows = [];
			for (const [key, item] of items) {
				if (item !== null && typeof item === "object") return void 0;
				rows.push({
					key: Array.isArray(container) ? FIELD_ITEM_MARK : key,
					value: scalarText(item)
				});
			}
			return rows.length === 0 ? void 0 : rows;
		}
		/**
		* Render a scalar as JSON spells it, except a string, which is itself.
		* @param value - a non-container value.
		* @returns its display text.
		*/
		function scalarText(value) {
			return typeof value === "string" ? value : JSON.stringify(value);
		}
		/**
		* Decide how one stored value reads.
		* @param value - stored value.
		* @returns the text, the key-value list, or indented JSON.
		*/
		function readValue(value) {
			const container = asContainer(value);
			if (container === void 0) return {
				kind: "text",
				text: formatValue(value)
			};
			const rows = flatPairs(container);
			if (rows === void 0) return {
				kind: "json",
				text: JSON.stringify(container, null, 2)
			};
			return {
				kind: "pairs",
				rows
			};
		}
		/**
		* Render one field: its name as the row label, its value editable in place.
		* @param props - field identity, stored value, row state, and the row's verbs.
		* @returns the row.
		*/
		function FieldRow({ fieldKey, value, state, t, onSave, onRetry, onAskRemove }) {
			const [text, setText] = (0, react.useState)(() => formatValue(value));
			const [editing, setEditing] = (0, react.useState)(false);
			const [copy, setCopy] = (0, react.useState)();
			const copyTimer = (0, react.useRef)();
			(0, react.useEffect)(() => {
				setText(formatValue(value));
			}, [value]);
			(0, react.useEffect)(() => {
				if (state === void 0) return;
				setEditing(state === "failed");
			}, [state]);
			(0, react.useEffect)(() => () => {
				if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
			}, []);
			const read = readValue(value);
			const copyText = editing ? text : formatValue(value);
			const valueLabel = `${fieldKey} · ${t("project.fieldValue")}`;
			/** Put the row's current text on the clipboard and say what happened. */
			const copyValue = () => {
				const settleCopy = (outcome) => {
					setCopy(outcome);
					if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
					copyTimer.current = setTimeout(() => {
						setCopy(void 0);
					}, COPY_LINGER_MS$1);
				};
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(copyText).then((accepted) => {
					settleCopy(accepted ? "copied" : "failed");
				}, () => {
					settleCopy("failed");
				});
			};
			/** Leave the editor: an edit that changed nothing is not a write. */
			const commit = () => {
				setEditing(false);
				if (text === formatValue(value)) return;
				onSave(text);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default$5.fieldRow, (editing || read.kind !== "text") && panel_module_css_default$5.fieldRowWide),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.fieldKey),
						title: fieldKey,
						children: fieldKey
					}),
					editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: cn(panel_module_css_default$5.valueEditor),
						"aria-label": valueLabel,
						"aria-invalid": state === "failed",
						rows: 1,
						value: text,
						autoFocus: true,
						onChange: (event) => {
							setText(event.target.value);
						},
						onBlur: commit,
						onKeyDown: (event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								setText(formatValue(value));
								setEditing(false);
								return;
							}
							if (event.key !== "Enter") return;
							event.preventDefault();
							event.currentTarget.blur();
						}
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: cn(panel_module_css_default$5.inlineText, panel_module_css_default$5.inlineValue, panel_module_css_default$5.fieldValueRead, read.kind === "text" && read.text === "" && panel_module_css_default$5.inlineEmpty),
						"aria-label": valueLabel,
						title: read.kind === "text" ? read.text === "" ? t("project.fieldValuePlaceholder") : read.text : formatValue(value),
						onClick: () => {
							setEditing(true);
						},
						children: [
							read.kind === "text" && (read.text === "" ? t("project.fieldValuePlaceholder") : read.text),
							read.kind === "pairs" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.valueGrid),
								children: read.rows.flatMap((row, index) => [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.valueGridKey),
									children: row.key
								}, `key-${index}`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.valueGridValue),
									children: row.value
								}, `value-${index}`)])
							}),
							read.kind === "json" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.valueJson),
								children: read.text
							})
						]
					}),
					state === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$5.rowFailed),
						onClick: () => {
							onRetry(text);
						},
						children: t("project.fieldFailed")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: cn(panel_module_css_default$5.rowTrail),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$5.rowState),
							role: "status",
							children: state === "saving" ? t("project.fieldSaving") : state === "saved" ? t("project.fieldSaved") : ""
						}), state === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn(panel_module_css_default$5.rowIcon, panel_module_css_default$5.rowAction, copy === "copied" ? panel_module_css_default$5.rowCopied : void 0, copy === "failed" ? panel_module_css_default$5.rowCopyFailed : void 0),
							"aria-label": copy === "copied" ? t("project.copied") : copy === "failed" ? t("project.copyFailed") : t("project.copyValueLabel", { name: fieldKey }),
							title: t("project.copyValue"),
							disabled: copyText === "",
							onClick: copyValue,
							children: copy === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckMark$1, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyMark$1, {})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn(panel_module_css_default$5.rowIcon, panel_module_css_default$5.rowAction, panel_module_css_default$5.rowRemove),
							"aria-label": `${t("project.fieldRemove")}: ${fieldKey}`,
							title: t("project.fieldRemove"),
							onClick: onAskRemove,
							children: "×"
						})] })]
					})
				]
			});
		}
		/**
		* Render the field table.
		* @param props - project identity, stored fields, and the table's verbs.
		* @returns the rows, the add-field row, and the removal confirmation.
		*/
		function FieldTable({ projectId, fields, t, onSave, onRemove, adding, onAddingChange }) {
			const guard = useComposingGuard();
			const [rowState, setRowState] = (0, react.useState)({});
			const [confirmingKey, setConfirmingKey] = (0, react.useState)();
			const [draftKey, setDraftKey] = (0, react.useState)("");
			const [draftValue, setDraftValue] = (0, react.useState)("");
			const [draftGeneration, setDraftGeneration] = (0, react.useState)(0);
			const linger = (0, react.useRef)({});
			(0, react.useEffect)(() => {
				setRowState({});
				setConfirmingKey(void 0);
				setDraftKey("");
				setDraftValue("");
				setDraftGeneration(0);
				onAddingChange(false);
			}, [projectId]);
			(0, react.useEffect)(() => () => {
				for (const timer of Object.values(linger.current)) clearTimeout(timer);
			}, []);
			const settle = (fieldKey, state) => {
				setRowState((current) => ({
					...current,
					[fieldKey]: state
				}));
				const previous = linger.current[fieldKey];
				if (previous !== void 0) clearTimeout(previous);
				if (state !== "saved") return;
				linger.current[fieldKey] = setTimeout(() => {
					setRowState((current) => {
						const next = { ...current };
						delete next[fieldKey];
						return next;
					});
				}, SAVED_LINGER_MS);
			};
			const store = (fieldKey, value) => {
				settle(fieldKey, "saving");
				onSave(fieldKey, value).then(() => {
					settle(fieldKey, "saved");
				}, () => {
					settle(fieldKey, "failed");
				});
			};
			const addDraft = () => {
				const key = draftKey.trim();
				if (key === "") return;
				store(key, parseValue(draftValue));
				setDraftKey("");
				setDraftValue("");
				setDraftGeneration((generation) => generation + 1);
			};
			const confirmRemove = () => {
				const fieldKey = confirmingKey;
				if (fieldKey === void 0) return;
				setConfirmingKey(void 0);
				onRemove(fieldKey).then(() => {
					setRowState((current) => {
						const next = { ...current };
						delete next[fieldKey];
						return next;
					});
				}, () => {
					settle(fieldKey, "failed");
				});
			};
			const entries = Object.entries(fields);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default$5.fields),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default$5.fieldsHead),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$5.sectionTitle),
							children: t("project.fields")
						}), !adding && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							size: "sm",
							onClick: () => {
								onAddingChange(true);
							},
							children: ["+ ", t("project.addField")]
						})]
					}),
					entries.length === 0 && !adding && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.note),
						children: t("project.fieldsEmpty")
					}),
					entries.map(([fieldKey, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldRow, {
						fieldKey,
						value,
						state: rowState[fieldKey],
						t,
						onSave: (text) => {
							store(fieldKey, parseValue(text));
						},
						onRetry: (text) => {
							store(fieldKey, parseValue(text));
						},
						onAskRemove: () => {
							setConfirmingKey(fieldKey);
						}
					}, fieldKey)),
					adding && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default$5.fieldRow),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$5.inputFill, panel_module_css_default$5.draftKey),
								"aria-label": t("project.fieldKey"),
								placeholder: t("project.fieldKeyPlaceholder"),
								value: draftKey,
								autoFocus: true,
								onChange: (event) => {
									setDraftKey(event.target.value);
								},
								onCompositionStart: guard.onCompositionStart,
								onCompositionEnd: guard.onCompositionEnd,
								onKeyDown: (event) => {
									if (event.key === "Escape") {
										onAddingChange(false);
										return;
									}
									if (event.key !== "Enter" || guard.isComposing(event)) return;
									event.preventDefault();
									addDraft();
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$5.inputFill),
								"aria-label": t("project.fieldValue"),
								placeholder: t("project.fieldValuePlaceholder"),
								value: draftValue,
								onChange: (event) => {
									setDraftValue(event.target.value);
								},
								onCompositionStart: guard.onCompositionStart,
								onCompositionEnd: guard.onCompositionEnd,
								onKeyDown: (event) => {
									if (event.key === "Escape") {
										onAddingChange(false);
										return;
									}
									if (event.key !== "Enter" || guard.isComposing(event)) return;
									event.preventDefault();
									addDraft();
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								disabled: draftKey.trim() === "",
								onClick: addDraft,
								children: t("project.fieldAdd")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: cn(panel_module_css_default$5.rowIcon),
								"aria-label": t("project.cancel"),
								title: t("project.cancel"),
								onClick: () => {
									onAddingChange(false);
								},
								children: "×"
							})
						]
					}, draftGeneration),
					entries.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.hint),
						children: t("project.fieldsHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmingKey !== void 0,
						onClose: () => {
							setConfirmingKey(void 0);
						},
						title: t("project.fieldRemove"),
						closeLabel: t("project.cancel"),
						description: t("project.fieldRemoveConfirm", { name: confirmingKey ?? "" }),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							onClick: () => {
								setConfirmingKey(void 0);
							},
							children: t("project.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							className: cn(panel_module_css_default$5.dangerButton),
							onClick: confirmRemove,
							children: t("project.fieldRemoveYes")
						})] })
					})
				]
			});
		}
		//#endregion
		//#region src/client/project/InlineText.tsx
		/**
		* A value that is edited where it is read.
		*
		* The project name and its code are the two things an operator notices wrong a
		* second after creating a project, so they are editable in place rather than
		* behind a dialog: click the text, type, and leave. Enter and blur both commit,
		* Escape puts the stored value back, and a composition is never mistaken for a
		* submit (see {@link useComposingGuard}).
		*/
		/**
		* Render one editable text value.
		* @param props - stored value, copy, and the commit callback.
		* @returns the read view, or the input while editing.
		*/
		function InlineText({ value, label, placeholder, emptyText, disabled = false, variant = "value", className, onCommit }) {
			const guard = useComposingGuard();
			const [editing, setEditing] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)(value);
			const settled = (0, react.useRef)(false);
			const start = () => {
				if (disabled) return;
				settled.current = false;
				setDraft(value);
				setEditing(true);
			};
			const finish = (commit) => {
				if (settled.current) return;
				settled.current = true;
				setEditing(false);
				if (!commit) return;
				const next = draft.trim();
				if (next !== value) onCommit(next);
			};
			if (!editing) {
				const shown = value === "" ? emptyText ?? placeholder ?? "" : value;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: [
						panel_module_css_default$5.inlineText,
						variant === "title" ? panel_module_css_default$5.inlineTitle : panel_module_css_default$5.inlineValue,
						value === "" ? panel_module_css_default$5.inlineEmpty : "",
						className
					].filter(Boolean).join(" "),
					"aria-label": label,
					title: value === "" ? placeholder : value,
					disabled,
					onClick: start,
					children: shown
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
				className: [panel_module_css_default$5.inputFill, className].filter(Boolean).join(" "),
				"aria-label": label,
				placeholder,
				value: draft,
				autoFocus: true,
				onChange: (event) => {
					setDraft(event.target.value);
				},
				onCompositionStart: guard.onCompositionStart,
				onCompositionEnd: guard.onCompositionEnd,
				onBlur: () => {
					finish(true);
				},
				onKeyDown: (event) => {
					if (event.key === "Enter") {
						if (guard.isComposing(event)) return;
						event.preventDefault();
						finish(true);
					} else if (event.key === "Escape") {
						event.preventDefault();
						finish(false);
					}
				}
			});
		}
		//#endregion
		//#region src/client/project/ProjectManager.tsx
		/**
		* The project surface: one list on the left, the selected project's properties
		* and fields on the right, inside the framework's own dialog chrome.
		*
		* The layout carries the two lessons the first version learned. Creating a
		* project is not a form parked in the middle of the list: it is one action that
		* opens a dialog when the operator asks for it. And a project's own columns
		* (name, code, status) are editable in place, because an API that can update
		* them is useless if the only way to fix a typo is to delete the project and
		* rebuild its fields.
		*
		* Nothing here fetches: every call arrives as a prop from the entry's inject
		* face, which is what keeps this file testable without the host.
		*/
		/** Below this many projects the list is short enough to read without a search box. */
		const SEARCH_THRESHOLD$1 = 8;
		/** Copy for one project status. */
		const STATUS_KEYS = {
			active: "project.status.active",
			paused: "project.status.paused",
			done: "project.status.done"
		};
		/**
		* The mark in front of every project row: the same filing-box outline the panel
		* entry uses, drawn here so the list and the entry read as one feature.
		* @param props.size - rendered box size; the empty state asks for a larger one.
		* @returns the decorative glyph.
		*/
		function ProjectMark({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "1.75",
					y: "3.25",
					width: "12.5",
					height: "9.5",
					rx: "1.75",
					stroke: "currentColor",
					strokeWidth: "1.2"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M1.75 6h12.5",
					stroke: "currentColor",
					strokeWidth: "1.2"
				})]
			});
		}
		/**
		* Render the project surface.
		* @param props - injected API, copy seat, and close verb.
		* @returns the dialog, plus its create dialog and its removal confirmation.
		*/
		function ProjectManager({ t, onClose, ...api }) {
			const [projects, setProjects] = (0, react.useState)([]);
			const [selected, setSelected] = (0, react.useState)();
			const [includeArchived, setIncludeArchived] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)();
			const [creating, setCreating] = (0, react.useState)(false);
			const [confirmingRemove, setConfirmingRemove] = (0, react.useState)(false);
			const [acknowledged, setAcknowledged] = (0, react.useState)(false);
			const [addingField, setAddingField] = (0, react.useState)(false);
			const list = (0, react.useRef)(null);
			const listSeq = (0, react.useRef)(0);
			const detailSeq = (0, react.useRef)(0);
			const pendingScroll = (0, react.useRef)();
			const focusedOnce = (0, react.useRef)(false);
			const forget = (cause) => cause instanceof Error ? cause.message : String(cause);
			/** Read the list, keeping the selection when it is still there. */
			const load = (0, react.useCallback)((keepId, archived = includeArchived) => {
				const seq = ++listSeq.current;
				setLoading(true);
				setFailure(void 0);
				return api.listProjects(archived).then(async (rows) => {
					if (seq !== listSeq.current) return;
					setProjects(rows);
					const remembered = keepId ?? (rows.some((row) => row.projectId === selected?.projectId) ? selected?.projectId : rows[0]?.projectId);
					if (remembered === void 0) {
						setSelected(void 0);
						return;
					}
					const detail = await api.getProject(remembered);
					if (seq !== listSeq.current) return;
					setSelected(detail);
				}, (cause) => {
					if (seq !== listSeq.current) return;
					setFailure(forget(cause));
				}).finally(() => {
					if (seq === listSeq.current) setLoading(false);
				});
			}, [api, includeArchived]);
			(0, react.useEffect)(() => {
				load(void 0, includeArchived);
			}, [includeArchived]);
			const select = (projectId) => {
				const seq = ++detailSeq.current;
				api.getProject(projectId).then((detail) => {
					if (seq === detailSeq.current) setSelected(detail);
				}, (cause) => {
					if (seq === detailSeq.current) setFailure(forget(cause));
				});
			};
			/** Run one surface-wide action with the shared busy/error envelope. */
			const run = (0, react.useCallback)(async (action) => {
				setBusy(true);
				setFailure(void 0);
				try {
					await action();
				} catch (cause) {
					setFailure(forget(cause));
				} finally {
					setBusy(false);
				}
			}, []);
			/** The first row is reachable by Tab before anything is selected. */
			const tabbableId = selected?.projectId ?? projects[0]?.projectId;
			(0, react.useEffect)(() => {
				if (loading || focusedOnce.current) return;
				focusedOnce.current = true;
				list.current?.querySelector("[role=\"option\"][tabindex=\"0\"]")?.focus();
			}, [loading]);
			(0, react.useEffect)(() => {
				const target = pendingScroll.current;
				if (target === void 0) return;
				pendingScroll.current = void 0;
				list.current?.querySelector(`[data-project="${target}"]`)?.scrollIntoView({ block: "nearest" });
			}, [projects]);
			const create = (draft) => run(async () => {
				const created = await api.createProject({
					name: draft.name,
					code: draft.code
				});
				pendingScroll.current = created.projectId;
				setCreating(false);
				await load(created.projectId);
			});
			/** Store one of the project's own columns; the list keeps step with it. */
			const patch = (change) => {
				const target = selected;
				if (target === void 0) return;
				run(async () => {
					const detail = await api.updateProject(target.projectId, change);
					setSelected((current) => current?.projectId === detail.projectId ? detail : current);
					setProjects(await api.listProjects(includeArchived));
				});
			};
			const setArchived = (archived) => {
				const target = selected;
				if (target === void 0) return;
				run(async () => {
					await api.archiveProject(target.projectId, archived);
					setProjects(await api.listProjects(includeArchived));
					setSelected(void 0);
					setAddingField(false);
				});
			};
			const removeForever = () => {
				const target = selected;
				if (target === void 0) return;
				run(async () => {
					await api.removeProject(target.projectId);
					setConfirmingRemove(false);
					setAcknowledged(false);
					setAddingField(false);
					const rows = await api.listProjects(includeArchived);
					setProjects(rows);
					const next = rows[0];
					setSelected(next === void 0 ? void 0 : await api.getProject(next.projectId));
				});
			};
			/** The top layer owns Escape: an open dialog closes first, not the surface. */
			const requestClose = () => {
				if (creating || confirmingRemove) return;
				onClose();
			};
			/** Store the value of the project the row belongs to, never a newer selection. */
			const applyDetail = (detail) => {
				setSelected((current) => current?.projectId === detail.projectId ? detail : current);
			};
			const needle = query.trim().toLowerCase();
			const visible = needle === "" ? projects : projects.filter((project) => project.name.toLowerCase().includes(needle) || project.code.toLowerCase().includes(needle));
			const onListKeyDown = (event) => {
				if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
				if (visible.length === 0) return;
				event.preventDefault();
				const current = visible.findIndex((project) => project.projectId === selected?.projectId);
				const last = visible.length - 1;
				const next = event.key === "ArrowDown" ? Math.min(last, current + 1) : Math.max(0, current <= 0 ? 0 : current - 1);
				const target = visible[next];
				if (target === void 0) return;
				select(target.projectId);
				list.current?.querySelector(`[data-project="${target.projectId}"]`)?.focus();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
					open: true,
					onClose: requestClose,
					title: t("project.title"),
					closeLabel: t("project.close"),
					className: cn(panel_module_css_default$5.manager),
					contentClassName: cn(panel_module_css_default$5.managerContent),
					children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: cn(panel_module_css_default$5.error),
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$5.errorText),
							children: t("project.readFailed", { message: failure })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn(panel_module_css_default$5.errorAction),
							onClick: () => {
								load();
							},
							children: t("project.retry")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default$5.body),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: cn(panel_module_css_default$5.listPane),
							"aria-label": t("project.list"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.listHead),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.listTitle),
										children: t("project.list")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										disabled: busy,
										onClick: () => {
											setCreating(true);
										},
										children: ["+ ", t("project.new")]
									})]
								}),
								projects.length >= SEARCH_THRESHOLD$1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									type: "search",
									className: cn(panel_module_css_default$5.inputFill),
									"aria-label": t("project.search"),
									placeholder: t("project.search"),
									value: query,
									onChange: (event) => {
										setQuery(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									ref: list,
									className: cn(panel_module_css_default$5.projects),
									role: "listbox",
									"aria-label": t("project.list"),
									onKeyDown: onListKeyDown,
									children: visible.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "option",
										"aria-selected": project.projectId === selected?.projectId,
										tabIndex: project.projectId === tabbableId ? 0 : -1,
										className: cn(panel_module_css_default$5.projectRow, panel_module_css_default$5.projectRowStack),
										"data-project": project.projectId,
										"data-archived": project.archived ? "" : void 0,
										onClick: () => {
											select(project.projectId);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: cn(panel_module_css_default$5.projectMark),
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectMark, {})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: cn(panel_module_css_default$5.projectStack),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$5.projectName),
												title: project.name,
												children: project.name
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: cn(panel_module_css_default$5.projectSub),
												children: [
													project.code !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: cn(panel_module_css_default$5.projectCode),
														children: project.code
													}),
													project.archived && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: cn(panel_module_css_default$5.tag),
														children: t("project.archived")
													}),
													project.fieldCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: cn(panel_module_css_default$5.projectMeta),
														children: t("project.fieldCount", { count: project.fieldCount })
													})
												]
											})]
										})]
									}) }, project.projectId))
								}),
								needle !== "" && visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("project.searchEmpty", { query: query.trim() })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: cn(panel_module_css_default$5.archivedToggle),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: includeArchived,
										disabled: busy,
										onChange: (event) => {
											setIncludeArchived(event.target.checked);
										}
									}), t("project.showArchived")]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
							className: cn(panel_module_css_default$5.detailPane),
							children: selected === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$5.empty),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.emptyMark),
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectMark, { size: 28 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cn(panel_module_css_default$5.emptyTitle),
										children: projects.length === 0 ? t("project.empty") : t("project.pickHint")
									}),
									projects.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cn(panel_module_css_default$5.note),
										children: t("project.emptyHint")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										onClick: () => {
											setCreating(true);
										},
										children: t("project.new")
									})] })
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InlineText, {
									variant: "title",
									className: cn(panel_module_css_default$5.detailName),
									value: selected.name,
									label: t("project.renameProject"),
									placeholder: t("project.namePlaceholder"),
									disabled: busy,
									onCommit: (next) => {
										patch({ name: next });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: cn(panel_module_css_default$5.props),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("project.code")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InlineText, {
												value: selected.code,
												label: t("project.changeCode"),
												placeholder: t("project.codePlaceholder"),
												emptyText: t("project.codeEmpty"),
												disabled: busy,
												onCommit: (next) => {
													patch({ code: next });
												}
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$5.propLabel),
											children: t("project.status")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$5.propValue),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$5.statusGroup),
												role: "group",
												"aria-label": t("project.status"),
												children: PROJECT_STATUSES.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
													active: status === selected.status,
													disabled: busy,
													"aria-pressed": status === selected.status,
													onClick: () => {
														if (status !== selected.status) patch({ status });
													},
													children: t(STATUS_KEYS[status])
												}, status))
											})
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$5.detailActions),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										size: "sm",
										disabled: busy,
										onClick: () => {
											setArchived(!selected.archived);
										},
										children: selected.archived ? t("project.restore") : t("project.archive")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										className: cn(panel_module_css_default$5.dangerButton),
										disabled: busy,
										onClick: () => {
											setAcknowledged(false);
											setConfirmingRemove(true);
										},
										children: t("project.remove")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", { className: cn(panel_module_css_default$5.rule) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldTable, {
									projectId: selected.projectId,
									fields: selected.fields,
									t,
									adding: addingField,
									onAddingChange: setAddingField,
									onSave: async (fieldKey, value) => {
										applyDetail(await api.setField(selected.projectId, fieldKey, value));
									},
									onRemove: async (fieldKey) => {
										applyDetail(await api.removeField(selected.projectId, fieldKey));
									}
								})
							] })
						})]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreateProjectDialog, {
					open: creating,
					t,
					onCancel: () => {
						setCreating(false);
					},
					onCreate: create
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
					open: confirmingRemove && selected !== void 0,
					title: t("project.removeTitle"),
					description: t("project.removeDescription", {
						name: selected?.name ?? "",
						count: selected?.fieldCount ?? 0
					}),
					acknowledgeLabel: t("project.removeAcknowledge"),
					cancelLabel: t("project.cancel"),
					closeLabel: t("project.cancel"),
					confirmLabel: t("project.removeConfirm"),
					acknowledged,
					disabled: busy,
					onAcknowledgedChange: setAcknowledged,
					onCancel: () => {
						setConfirmingRemove(false);
					},
					onConfirm: removeForever
				})
			] });
		}
		//#endregion
		//#region src/client/ProjectItem.tsx
		/**
		* The panel's built-in entry: one row that opens the project surface.
		*
		* The row is the panel's — it decides which entries exist, in what order, and
		* under what names — and this entry supplies the two things only it knows: the
		* glyph, and the surface the glyph opens. So the name arrives as an owner prop
		* instead of being read from this package's dictionary, and what stays here is
		* the open state of this one surface.
		*
		* The surface is a dialog rather than a region of the panel body — a 280px strip
		* cannot hold a list beside a field table — and this entry owns it, so opening it
		* needs no cross-seat coordination. While the surface is up the entry also tells
		* the panel to stand down, and when it closes the entry hands focus back to the
		* row that opened it.
		*/
		/**
		* The entry's glyph: a filing-box outline drawn here instead of imported, so the
		* mark's shape and name do not track one harness release's icon set.
		* @returns the decorative svg.
		*/
		function FolderMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "1.75",
						y: "3.25",
						width: "12.5",
						height: "9.5",
						rx: "1.75",
						stroke: "currentColor",
						strokeWidth: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M1.75 6h12.5",
						stroke: "currentColor",
						strokeWidth: "1.2"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M5.25 3.25V2.4a.9.9 0 0 1 .9-.9h3.7a.9.9 0 0 1 .9.9v.85",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinejoin: "round"
					})
				]
			});
		}
		/**
		* Render the entry row and, while open, the project surface.
		* @param props - composed slot props.
		* @returns the row, plus the dialog when it is showing.
		*/
		function ProjectItem({ t, label, pushOverlay, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const announce = (0, react.useRef)(pushOverlay);
			announce.current = pushOverlay;
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				const release = announce.current();
				return () => {
					release();
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: panel_item_module_css_default.item,
				"data-active": open ? "" : void 0,
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen((value) => !value);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderMark, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.label,
					children: label
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\skill\panel.module.css.mjs
		const css$2 = "._72vL5W_head{align-items:center;gap:8px;display:flex}._72vL5W_title{min-width:0;color:var(--dsw-alias-label-primary);flex:1;align-items:center;gap:8px;margin:0;font-size:14px;font-weight:600;display:flex}._72vL5W_groups{flex-direction:column;flex:1;gap:10px;min-height:0;display:flex;overflow-y:auto}._72vL5W_group{letter-spacing:.04em;color:var(--dsw-alias-label-tertiary);margin:0 0 4px;padding:0 2px;font-size:12px;font-weight:600}._72vL5W_scopeHint{border-top:.5px solid var(--dsw-alias-border-l1);flex:none;margin-top:0;padding-top:8px}._72vL5W_rowOff{opacity:.55}._72vL5W_doc{min-width:0}._72vL5W_clamp{display:block}._72vL5W_clampOn{-webkit-line-clamp:4;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}";
		const tagId$2 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var panel_module_css_default$1 = {
			"clamp": "_72vL5W_clamp",
			"clampOn": "_72vL5W_clampOn",
			"doc": "_72vL5W_doc",
			"group": "_72vL5W_group",
			"groups": "_72vL5W_groups",
			"head": "_72vL5W_head",
			"rowOff": "_72vL5W_rowOff",
			"scopeHint": "_72vL5W_scopeHint",
			"title": "_72vL5W_title"
		};
		//#endregion
		//#region src/client/skill/SkillManager.tsx
		/**
		* The skill surface: the skills this plugin ships on one side of the list, the
		* operator's own on the other, and the selected skill's instructions beside
		* them, inside the framework's own dialog chrome.
		*
		* The split is the point, and it is enforced rather than merely described. A
		* skill this plugin registers exists only while the plugin does, so it can be
		* switched off here; a skill the operator wrote lives in their own skill
		* directories, so this surface shows it and never offers to change it. The host
		* refuses a switch on any name this plugin does not ship, so the rule holds even
		* if a later version of this file forgets it.
		*
		* Nothing here fetches: every call arrives as a prop from the entry's inject
		* face, which is what keeps this file testable without the host.
		*/
		/** Below this many skills the list is short enough to read without a search box. */
		const SEARCH_THRESHOLD = 8;
		/**
		* A description longer than this folds to four lines.
		*
		* The value is not a preference — it sits in a gap in the data. The thirteen
		* skills this plugin ships split cleanly: seven descriptions of 101 characters
		* or fewer, six of 182 or more, and nothing in between. Anything in that band
		* separates the same two groups. See `.clampOn` for why this is a character
		* count and not a measurement of the laid-out box.
		*/
		const DESC_FOLD_AT = 120;
		/**
		* The mark in front of every skill row: a sheet with a folded corner.
		* @param props.size - rendered box size; the empty state asks for a larger one.
		* @returns the decorative glyph.
		*/
		function SkillMark({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.6 2.3h5.3l3.5 3.5v6.9a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9V3.2a.9.9 0 0 1 .9-.9Z",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8.75 2.5v3.4h3.4",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinejoin: "round"
				})]
			});
		}
		/**
		* Render the skill surface.
		* @param props - injected API, copy seat, and close verb.
		* @returns the dialog.
		*/
		function SkillManager({ t, onClose, ...api }) {
			const [skills, setSkills] = (0, react.useState)([]);
			const [complete, setComplete] = (0, react.useState)(true);
			const [selected, setSelected] = (0, react.useState)();
			const [query, setQuery] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)();
			const [descriptionOpen, setDescriptionOpen] = (0, react.useState)(false);
			const list = (0, react.useRef)(null);
			const listSeq = (0, react.useRef)(0);
			const detailSeq = (0, react.useRef)(0);
			const focusedOnce = (0, react.useRef)(false);
			const forget = (cause) => cause instanceof Error ? cause.message : String(cause);
			/** Read the list, keeping the selection when it is still there. */
			const load = (0, react.useCallback)((keepName) => {
				const seq = ++listSeq.current;
				setLoading(true);
				setFailure(void 0);
				return api.listSkills().then(async (payload) => {
					if (seq !== listSeq.current) return;
					setSkills(payload.skills);
					setComplete(payload.complete);
					const remembered = keepName ?? (payload.skills.some((skill) => skill.name === selected?.name) ? selected?.name : payload.skills[0]?.name);
					if (remembered === void 0) {
						setSelected(void 0);
						return;
					}
					const detail = await api.getSkill(remembered);
					if (seq !== listSeq.current) return;
					setSelected(detail);
				}, (cause) => {
					if (seq !== listSeq.current) return;
					setFailure(forget(cause));
				}).finally(() => {
					if (seq === listSeq.current) setLoading(false);
				});
			}, [api]);
			(0, react.useEffect)(() => {
				load();
			}, []);
			const select = (name) => {
				const seq = ++detailSeq.current;
				api.getSkill(name).then((detail) => {
					if (seq === detailSeq.current) setSelected(detail);
				}, (cause) => {
					if (seq === detailSeq.current) setFailure(forget(cause));
				});
			};
			const markdownLabels = (0, react.useMemo)(() => ({
				code: {
					copyLabel: t("skill.copyCode"),
					copiedLabel: t("skill.copied")
				},
				footnotes: t("skill.footnotes")
			}), [t]);
			/** Flip the selected skill, then re-read so the list shows the new state too. */
			const toggle = () => {
				const target = selected;
				if (target === void 0 || !target.managed) return;
				(async () => {
					setBusy(true);
					setFailure(void 0);
					try {
						setSelected(await api.setSkillEnabled(target.name, !target.enabled));
						const payload = await api.listSkills();
						setSkills(payload.skills);
						setComplete(payload.complete);
					} catch (cause) {
						setFailure(forget(cause));
					} finally {
						setBusy(false);
					}
				})();
			};
			/** The first row is reachable by Tab before anything is selected. */
			const tabbableName = selected?.name ?? skills[0]?.name;
			(0, react.useEffect)(() => {
				if (loading || focusedOnce.current) return;
				focusedOnce.current = true;
				list.current?.querySelector("[role=\"option\"][tabindex=\"0\"]")?.focus();
			}, [loading]);
			(0, react.useEffect)(() => {
				setDescriptionOpen(false);
			}, [selected?.name]);
			const needle = query.trim().toLowerCase();
			const visible = needle === "" ? skills : skills.filter((skill) => skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle));
			const mine = visible.filter((skill) => skill.managed);
			const theirs = visible.filter((skill) => !skill.managed);
			const onListKeyDown = (event) => {
				if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
				if (visible.length === 0) return;
				event.preventDefault();
				const current = visible.findIndex((skill) => skill.name === selected?.name);
				const last = visible.length - 1;
				const next = event.key === "ArrowDown" ? Math.min(last, current + 1) : Math.max(0, current <= 0 ? 0 : current - 1);
				const target = visible[next];
				if (target === void 0) return;
				select(target.name);
				list.current?.querySelector(`[data-skill="${target.name}"]`)?.focus();
			};
			/**
			* One row. Both groups render through here, so a row looks and behaves the
			* same wherever it sits; the heading above it is what tells them apart.
			* @param skill - the row's skill.
			* @returns the list item.
			*/
			const row = (skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "option",
				"aria-selected": skill.name === selected?.name,
				tabIndex: skill.name === tabbableName ? 0 : -1,
				className: cn(panel_module_css_default$5.projectRow, skill.managed && !skill.enabled ? panel_module_css_default$1.rowOff : void 0),
				"data-skill": skill.name,
				onClick: () => {
					select(skill.name);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectMark),
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillMark, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectName),
						title: skill.name,
						children: skill.name
					}),
					skill.managed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.projectMeta),
						children: skill.enabled ? t("skill.enabled") : t("skill.disabled")
					})
				]
			}) }, skill.name);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("skill.title"),
				closeLabel: t("skill.close"),
				className: cn(panel_module_css_default$5.manager),
				contentClassName: cn(panel_module_css_default$5.managerContent),
				children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: cn(panel_module_css_default$5.error),
					role: "alert",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.errorText),
						children: t("skill.readFailed", { message: failure })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$5.errorAction),
						onClick: () => {
							load();
						},
						children: t("skill.retry")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default$5.body),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: cn(panel_module_css_default$5.listPane),
						"aria-label": t("skill.list"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cn(panel_module_css_default$5.listHead),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.listTitle),
									children: t("skill.list")
								})
							}),
							skills.length >= SEARCH_THRESHOLD && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								type: "search",
								className: cn(panel_module_css_default$5.inputFill),
								"aria-label": t("skill.search"),
								placeholder: t("skill.search"),
								value: query,
								onChange: (event) => {
									setQuery(event.target.value);
								}
							}),
							!complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: t("skill.partial")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$1.groups),
								children: [mine.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$1.group),
									children: t("skill.mine")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									ref: list,
									className: cn(panel_module_css_default$5.projects),
									role: "listbox",
									"aria-label": t("skill.mine"),
									onKeyDown: onListKeyDown,
									children: mine.map(row)
								})] }), theirs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$1.group),
									children: t("skill.theirs")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: cn(panel_module_css_default$5.projects),
									role: "listbox",
									"aria-label": t("skill.theirs"),
									onKeyDown: onListKeyDown,
									children: theirs.map(row)
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note, panel_module_css_default$1.scopeHint),
								children: t("skill.scopeHint")
							}),
							needle !== "" && visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: t("skill.searchEmpty", { query: query.trim() })
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: cn(panel_module_css_default$5.detailPane),
						children: selected === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$5.empty),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.emptyMark),
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillMark, { size: 28 })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.emptyTitle),
								children: loading ? t("skill.loading") : skills.length === 0 ? t("skill.empty") : t("skill.pickHint")
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$1.head),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
									className: cn(panel_module_css_default$1.title),
									children: [selected.name, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.projectMeta),
										children: selected.managed ? selected.enabled ? t("skill.enabled") : t("skill.disabled") : t("skill.readonly")
									})]
								}), selected.managed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: selected.enabled ? "outline" : "primary",
									size: "sm",
									disabled: busy,
									onClick: toggle,
									children: selected.enabled ? t("skill.disable") : t("skill.enable")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.note),
								children: selected.managed ? t("skill.managedHint") : t("skill.readonlyHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: cn(panel_module_css_default$5.props),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("skill.description")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: cn(panel_module_css_default$1.clamp, !descriptionOpen && panel_module_css_default$1.clampOn),
											children: selected.description
										}), selected.description.length > DESC_FOLD_AT && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cn(panel_module_css_default$5.foldToggle),
											"aria-expanded": descriptionOpen,
											onClick: () => {
												setDescriptionOpen(!descriptionOpen);
											},
											children: descriptionOpen ? t("skill.fold") : t("skill.unfold")
										})]
									}),
									selected.whenToUse !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("skill.whenToUse")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: selected.whenToUse
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$5.propLabel),
										children: t("skill.source")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$5.propValue),
										children: selected.source
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", { className: cn(panel_module_css_default$5.rule) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								className: cn(panel_module_css_default$5.sectionTitle),
								children: t("skill.body")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cn(panel_module_css_default$1.doc),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
									text: selected.content,
									labels: markdownLabels
								})
							})
						] })
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/SkillItem.tsx
		/**
		* The panel's second built-in entry: one row that opens the skill surface.
		*
		* Like the project row it owns the dialog it opens, so opening it needs no
		* cross-seat coordination and the panel's own dismissals stand down while it is
		* up. The two rows are one visual part by construction — they share the entry
		* stylesheet and both take their name from the panel — because a panel whose
		* buttons are laid out differently from each other reads as two features that
		* happened to land in the same box.
		*/
		/**
		* The entry's glyph: a sheet with a folded corner. Drawn here instead of
		* imported, so the mark's shape tracks nothing but this file.
		* @returns the decorative svg.
		*/
		function DocMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.6 2.3h5.3l3.5 3.5v6.9a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9V3.2a.9.9 0 0 1 .9-.9Z",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8.75 2.5v3.4h3.4",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinejoin: "round"
				})]
			});
		}
		/**
		* Render the entry row and, while open, the skill surface.
		* @param props - composed slot props.
		* @returns the row, plus the dialog when it is showing.
		*/
		function SkillItem({ t, label, pushOverlay, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const announce = (0, react.useRef)(pushOverlay);
			announce.current = pushOverlay;
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				const release = announce.current();
				return () => {
					release();
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: panel_item_module_css_default.item,
				"data-active": open ? "" : void 0,
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen((value) => !value);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DocMark, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.label,
					children: label
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\wiki\panel.module.css.mjs
		const css$1 = "._7sSpOW_title{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:0 0 6px;font-size:14px;font-weight:600;display:flex}._7sSpOW_mono{word-break:break-all;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}._7sSpOW_rowNotReady{opacity:.55}._7sSpOW_pathRow{align-items:flex-start;gap:6px;display:flex}._7sSpOW_copyBtn{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;flex:none;padding:2px;line-height:0}._7sSpOW_copyBtn:hover{color:var(--dsw-alias-label-primary)}._7sSpOW_copyOk{color:var(--dsw-alias-state-success-primary)}._7sSpOW_copyBad{color:var(--dsw-alias-state-error-primary)}._7sSpOW_tabs{border-bottom:.5px solid var(--dsw-alias-border-l1);gap:2px;margin:2px 0 14px;display:flex}._7sSpOW_tab{appearance:none;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-bottom:2px solid #0000;align-items:center;gap:6px;padding:6px 10px;font-family:inherit;font-size:12px;display:inline-flex}._7sSpOW_tab:hover{color:var(--dsw-alias-label-primary)}._7sSpOW_tabActive{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:600}._7sSpOW_tabCount{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-size:12px}._7sSpOW_searchRow{align-items:center;gap:8px;margin-bottom:12px;display:flex}._7sSpOW_searchInput{flex:1;min-width:0}._7sSpOW_stats{flex-direction:column;gap:6px;display:flex}._7sSpOW_statBlock{grid-template-columns:132px max-content minmax(0,1fr);align-items:baseline;gap:6px 8px;font-size:12px;display:grid}._7sSpOW_stat{display:contents}._7sSpOW_statFootnote{grid-column:1/-1}._7sSpOW_statLabel{color:var(--dsw-alias-label-secondary);grid-column:1}._7sSpOW_statValue{font-variant-numeric:tabular-nums;text-align:right;color:var(--dsw-alias-label-primary);font-weight:600}._7sSpOW_statNote{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-size:12px}._7sSpOW_levelList{flex-direction:column;gap:5px;display:flex}._7sSpOW_levelRow{grid-template-columns:84px minmax(0,1fr) 56px 48px;align-items:center;gap:8px;font-size:12px;display:grid}._7sSpOW_levelName{color:var(--dsw-alias-label-secondary)}._7sSpOW_levelBar{background:var(--dsw-alias-border-l1);border-radius:999px;height:7px;overflow:hidden}._7sSpOW_levelFill{background:var(--dsw-alias-state-success-primary);border-radius:999px;height:100%;display:block}._7sSpOW_fillMid{background:var(--dsw-alias-state-business-primary)}._7sSpOW_fillLow{background:var(--dsw-alias-label-dimmed)}._7sSpOW_levelCount{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}._7sSpOW_levelShare{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-size:12px}._7sSpOW_gapList{flex-direction:column;margin:8px 0 0;padding:0;list-style:none;display:flex}._7sSpOW_gapItem{border-bottom:.5px solid var(--dsw-alias-border-l1)}._7sSpOW_gapRow{grid-template-columns:20px minmax(0,1fr) auto auto;align-items:baseline;gap:8px;padding:5px 0;font-size:12px;display:grid}._7sSpOW_gapRank{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}._7sSpOW_gapUri{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7sSpOW_gapCited{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}._7sSpOW_gapToggle{display:inline-grid}._7sSpOW_gapToggle>*{grid-area:1/1}._7sSpOW_gapToggleGhost{visibility:hidden}._7sSpOW_citers{padding:0 0 8px 28px}._7sSpOW_citerList{flex-wrap:wrap;gap:4px 10px;max-height:124px;margin:0;padding:0;font-size:12px;list-style:none;display:flex;overflow-y:auto}._7sSpOW_citerLink{text-align:left;font-family:inherit;font-size:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0}._7sSpOW_citerLink:hover{color:var(--dsw-alias-state-business-primary);text-decoration:underline}._7sSpOW_results{flex-direction:column;gap:8px;display:flex}._7sSpOW_resultHead{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px}._7sSpOW_resultList{flex-direction:column;gap:2px;max-height:320px;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}._7sSpOW_resultRow{text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;flex-direction:column;gap:2px;width:100%;padding:6px 8px;display:flex}._7sSpOW_resultRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._7sSpOW_resultRow:disabled{opacity:.6;cursor:default}._7sSpOW_resultName{color:var(--dsw-alias-label-primary);font-size:13px}._7sSpOW_resultFacts{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;display:flex}._7sSpOW_card{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;gap:8px;margin-top:14px;padding:10px 12px;display:flex}._7sSpOW_cardHead{flex-wrap:wrap;align-items:baseline;gap:8px;display:flex}._7sSpOW_cardTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}._7sSpOW_cardClose{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;margin-left:auto;padding:0;font-family:inherit;font-size:12px}._7sSpOW_cardClose:hover{color:var(--dsw-alias-label-primary)}._7sSpOW_cardFacts{flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;display:flex}._7sSpOW_cardFact{color:var(--dsw-alias-label-secondary)}._7sSpOW_cardSub{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;font-weight:600}._7sSpOW_lacks{color:var(--dsw-alias-label-tertiary);flex-direction:column;gap:2px;margin:0;padding-left:18px;font-size:12px;display:flex}._7sSpOW_relRow{grid-template-columns:92px 40px minmax(0,1fr);align-items:baseline;gap:8px;font-size:12px;display:grid}._7sSpOW_relKind{color:var(--dsw-alias-label-secondary)}._7sSpOW_relCount{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}._7sSpOW_relNames{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary)}._7sSpOW_termBlock{flex-direction:column;gap:4px;display:flex}._7sSpOW_termList{flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;display:flex}._7sSpOW_termRow{justify-content:space-between;gap:10px;font-size:12px;display:flex}._7sSpOW_termText{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}._7sSpOW_termCount{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}._7sSpOW_subTitle{color:var(--dsw-alias-label-secondary);margin:18px 0 6px;font-size:12px;font-weight:600}._7sSpOW_logList{flex-direction:column;gap:4px;max-height:168px;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}._7sSpOW_logRow{grid-template-columns:82px minmax(0,1fr);align-items:baseline;gap:8px;font-size:12px;line-height:18px;display:grid}._7sSpOW_logDate{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}._7sSpOW_logText{color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}";
		const tagId$1 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"card": "_7sSpOW_card",
			"cardClose": "_7sSpOW_cardClose",
			"cardFact": "_7sSpOW_cardFact",
			"cardFacts": "_7sSpOW_cardFacts",
			"cardHead": "_7sSpOW_cardHead",
			"cardSub": "_7sSpOW_cardSub",
			"cardTitle": "_7sSpOW_cardTitle",
			"citerLink": "_7sSpOW_citerLink",
			"citerList": "_7sSpOW_citerList",
			"citers": "_7sSpOW_citers",
			"copyBad": "_7sSpOW_copyBad",
			"copyBtn": "_7sSpOW_copyBtn",
			"copyOk": "_7sSpOW_copyOk",
			"fillLow": "_7sSpOW_fillLow",
			"fillMid": "_7sSpOW_fillMid",
			"gapCited": "_7sSpOW_gapCited",
			"gapItem": "_7sSpOW_gapItem",
			"gapList": "_7sSpOW_gapList",
			"gapRank": "_7sSpOW_gapRank",
			"gapRow": "_7sSpOW_gapRow",
			"gapToggle": "_7sSpOW_gapToggle",
			"gapToggleGhost": "_7sSpOW_gapToggleGhost",
			"gapUri": "_7sSpOW_gapUri",
			"lacks": "_7sSpOW_lacks",
			"levelBar": "_7sSpOW_levelBar",
			"levelCount": "_7sSpOW_levelCount",
			"levelFill": "_7sSpOW_levelFill",
			"levelList": "_7sSpOW_levelList",
			"levelName": "_7sSpOW_levelName",
			"levelRow": "_7sSpOW_levelRow",
			"levelShare": "_7sSpOW_levelShare",
			"logDate": "_7sSpOW_logDate",
			"logList": "_7sSpOW_logList",
			"logRow": "_7sSpOW_logRow",
			"logText": "_7sSpOW_logText",
			"mono": "_7sSpOW_mono",
			"pathRow": "_7sSpOW_pathRow",
			"relCount": "_7sSpOW_relCount",
			"relKind": "_7sSpOW_relKind",
			"relNames": "_7sSpOW_relNames",
			"relRow": "_7sSpOW_relRow",
			"resultFacts": "_7sSpOW_resultFacts",
			"resultHead": "_7sSpOW_resultHead",
			"resultList": "_7sSpOW_resultList",
			"resultName": "_7sSpOW_resultName",
			"resultRow": "_7sSpOW_resultRow",
			"results": "_7sSpOW_results",
			"rowNotReady": "_7sSpOW_rowNotReady",
			"searchInput": "_7sSpOW_searchInput",
			"searchRow": "_7sSpOW_searchRow",
			"stat": "_7sSpOW_stat",
			"statBlock": "_7sSpOW_statBlock",
			"statFootnote": "_7sSpOW_statFootnote",
			"statLabel": "_7sSpOW_statLabel",
			"statNote": "_7sSpOW_statNote",
			"statValue": "_7sSpOW_statValue",
			"stats": "_7sSpOW_stats",
			"subTitle": "_7sSpOW_subTitle",
			"tab": "_7sSpOW_tab",
			"tabActive": "_7sSpOW_tabActive",
			"tabCount": "_7sSpOW_tabCount",
			"tabs": "_7sSpOW_tabs",
			"termBlock": "_7sSpOW_termBlock",
			"termCount": "_7sSpOW_termCount",
			"termList": "_7sSpOW_termList",
			"termRow": "_7sSpOW_termRow",
			"termText": "_7sSpOW_termText",
			"title": "_7sSpOW_title"
		};
		//#endregion
		//#region src/client/wiki/WikiManager.tsx
		/**
		* The knowledge base surface: every registered vault on one side, and on the
		* other what that vault actually is — how much of it can answer a query, how its
		* pages connect, what it keeps citing and cannot find, and what it has been asked.
		*
		* Same shape as the other three surfaces, on purpose: the shared stylesheet
		* carries the pane split, the list, the property grid and the action row, and the
		* dialog chrome comes from `Modal`. Only what a vault has that a connection does
		* not is added here.
		*
		* The tabs exist because a vault is no longer a thing you only check the size of.
		* With 5374 pages, 52 580 reference edges and 2840 uncovered entities, a single
		* column of facts would be a wall — and the three questions an operator has
		* (what is in here, what is missing, is anyone using it) deserve separate answers.
		*
		* Read-only by design. Nothing on this surface writes to a vault: adding one stays
		* a file edit, because a machine path is not something to invite somebody to type
		* into a browser field.
		*/
		/** How much of a vault's log the activity tab shows. */
		const HISTORY_LIMIT = 8;
		/** How many hits a search lists before it stops drawing them. */
		const HIT_LIMIT = 40;
		/** How long typing settles before a search is sent. */
		const SEARCH_DEBOUNCE_MS = 300;
		/** How long a copy confirmation stays on screen. */
		const COPY_LINGER_MS = 1600;
		/** Which translation key names each level. Spelled out because `t` takes literals. */
		const LEVEL_KEY = {
			"query-ready": "wiki.level.query-ready",
			locatable: "wiki.level.locatable",
			concept: "wiki.level.concept"
		};
		/** Which translation key names each kind of relation. */
		const KIND_KEY = {
			reference: "wiki.kind.reference",
			refType: "wiki.kind.refType",
			implements: "wiki.kind.implements",
			composition: "wiki.kind.composition",
			depends: "wiki.kind.depends",
			extends: "wiki.kind.extends",
			parent: "wiki.kind.parent"
		};
		/**
		* The vault mark: an open book, matching the cell that opened this surface.
		* @returns the decorative svg.
		*/
		function BookMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.75 3.25h4.1c.66 0 1.15.53 1.15 1.18v8.32H3.9a1.15 1.15 0 0 1-1.15-1.15z",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M13.25 3.25h-4.1c-.66 0-1.15.53-1.15 1.18v8.32h4.1a1.15 1.15 0 0 0 1.15-1.15z",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinejoin: "round"
				})]
			});
		}
		/**
		* The copy affordance, matching the field table's in the project surface.
		* @returns the decorative svg.
		*/
		function CopyMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "13",
				height: "13",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "5.75",
					y: "5.75",
					width: "7.5",
					height: "7.5",
					rx: "1.25",
					stroke: "currentColor",
					strokeWidth: "1.3"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.25 3.75H3.9c-.6 0-1.15.5-1.15 1.15v6.35",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round"
				})]
			});
		}
		/**
		* The confirmation that replaces it once the text is on the clipboard.
		* @returns the decorative svg.
		*/
		function CheckMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "13",
				height: "13",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 8.5l3 3 6-6.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/**
		* A byte count in the unit a person reads it in.
		* @param value - the size in bytes.
		* @returns the formatted size.
		*/
		function bytes(value) {
			if (value < 1024) return `${value} B`;
			if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
			return `${(value / 1048576).toFixed(1)} MB`;
		}
		/** One labelled figure in the overview. */
		function Stat({ label, value, note }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default.stat),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.statLabel),
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.statValue),
						children: value
					}),
					note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.statNote),
						children: note
					})
				]
			});
		}
		/**
		* A share bar for one level.
		*
		* Drawn from the page counts rather than stored: the widths are the point, and a
		* number alone makes the operator compute the proportion themselves.
		*/
		function LevelBar({ level, pages, total, t }) {
			const share = total === 0 ? 0 : pages / total;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default.levelRow),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.levelName),
						children: t(LEVEL_KEY[level])
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.levelBar),
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default.levelFill, level === "locatable" ? panel_module_css_default.fillMid : void 0, level === "concept" ? panel_module_css_default.fillLow : void 0),
							style: { width: `${Math.max(share * 100, pages === 0 ? 0 : .6)}%` }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.levelCount),
						children: pages
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.levelShare),
						children: total === 0 ? "—" : `${(share * 100).toFixed(1)}%`
					})
				]
			});
		}
		/** One group of relations: how many, and a few names. */
		function RelationRow({ group, t }) {
			const more = group.total > group.sample.length ? " …" : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default.relRow),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.relKind),
						children: t(KIND_KEY[group.kind] ?? "wiki.kind.other")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default.relCount),
						children: group.total
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: cn(panel_module_css_default.relNames),
						children: [group.sample.join("、"), more]
					})
				]
			});
		}
		/**
		* Render the knowledge base dialog.
		* @param props - the wiki API, the copy, and the close gesture.
		* @returns the dialog.
		*/
		function WikiManager({ listVaults, rebuildVault, recentWrites, health, search, pageCard, citers, onClose, t }) {
			const [vaults, setVaults] = (0, react.useState)([]);
			const [selected, setSelected] = (0, react.useState)(void 0);
			/** The vault being rebuilt, or `'*'` while every vault is. */
			const [busy, setBusy] = (0, react.useState)(void 0);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [loading, setLoading] = (0, react.useState)(true);
			const [tab, setTab] = (0, react.useState)("overview");
			/** The vault's health, and the log tail the activity tab also holds. */
			const [report, setReport] = (0, react.useState)(void 0);
			const [recent, setRecent] = (0, react.useState)([]);
			/** What the operator typed, and what came back for it. */
			const [term, setTerm] = (0, react.useState)("");
			const [found, setFound] = (0, react.useState)(void 0);
			const [searching, setSearching] = (0, react.useState)(false);
			/** The page card opened from a hit, and the card being loaded. */
			const [card, setCard] = (0, react.useState)(void 0);
			const [cardBusy, setCardBusy] = (0, react.useState)(void 0);
			/** The gap whose citers are open, and what came back for it. */
			const [openGap, setOpenGap] = (0, react.useState)(void 0);
			const [gapCiters, setGapCiters] = (0, react.useState)([]);
			const [gapBusy, setGapBusy] = (0, react.useState)(false);
			/** How long the last rebuild took, so a slow one has a number attached to it. */
			const [rebuildMs, setRebuildMs] = (0, react.useState)(void 0);
			/** Whether copying the path worked, and the timer that clears the confirmation. */
			const [copied, setCopied] = (0, react.useState)(void 0);
			const copyTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
			}, []);
			const load = (0, react.useCallback)(async () => {
				setLoading(true);
				setFailure(void 0);
				try {
					const answer = await listVaults();
					setVaults(answer.vaults);
				} catch (cause) {
					setFailure(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setLoading(false);
				}
			}, [listVaults]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const current = vaults.find((vault) => vault.id === selected) ?? vaults[0];
			const currentId = current?.id;
			const ready = current?.ready === true;
			(0, react.useEffect)(() => {
				if (currentId === void 0 || !ready) {
					setReport(void 0);
					setRecent([]);
					return;
				}
				let live = true;
				health(currentId).then((answer) => {
					if (live) setReport(answer.reports[0]);
				}).catch(() => {
					if (live) setReport(void 0);
				});
				recentWrites(currentId, HISTORY_LIMIT).then((entries) => {
					if (live) setRecent(entries);
				}).catch(() => {
					if (live) setRecent([]);
				});
				return () => {
					live = false;
				};
			}, [
				health,
				recentWrites,
				currentId,
				ready,
				busy
			]);
			(0, react.useEffect)(() => {
				const wanted = term.trim();
				if (wanted === "") {
					setFound(void 0);
					setSearching(false);
					return;
				}
				let live = true;
				setSearching(true);
				const timer = setTimeout(() => {
					search(wanted, currentId, HIT_LIMIT).then((answer) => {
						if (live) setFound(answer);
					}).catch(() => {
						if (live) setFound(void 0);
					}).finally(() => {
						if (live) setSearching(false);
					});
				}, SEARCH_DEBOUNCE_MS);
				return () => {
					live = false;
					clearTimeout(timer);
				};
			}, [
				search,
				term,
				currentId
			]);
			const rebuild = async (vault) => {
				setBusy(vault ?? "*");
				setFailure(void 0);
				const started = Date.now();
				try {
					const answer = await rebuildVault(vault);
					setVaults(answer.vaults);
					setRebuildMs(Date.now() - started);
				} catch (cause) {
					setFailure(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(void 0);
				}
			};
			/** Put the vault path on the clipboard, since it is a machine fact people paste. */
			const copyPath = () => {
				const settle = (outcome) => {
					setCopied(outcome);
					if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
					copyTimer.current = setTimeout(() => {
						setCopied(void 0);
					}, COPY_LINGER_MS);
				};
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(current?.path ?? "").then((accepted) => {
					settle(accepted ? "copied" : "failed");
				}, () => {
					settle("failed");
				});
			};
			const openCard = async (page) => {
				setCardBusy(page);
				try {
					const answer = await pageCard(page, currentId);
					setCard(answer.card);
				} catch (cause) {
					setFailure(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setCardBusy(void 0);
				}
			};
			const toggleGap = async (uri) => {
				if (openGap === uri) {
					setOpenGap(void 0);
					setGapCiters([]);
					return;
				}
				setOpenGap(uri);
				setGapCiters([]);
				setGapBusy(true);
				try {
					const answer = await citers(uri, currentId);
					setGapCiters(answer.pages);
				} catch {
					setGapCiters([]);
				} finally {
					setGapBusy(false);
				}
			};
			const tabbable = selected ?? vaults[0]?.id;
			const when = (vault) => vault.indexedAt === void 0 ? t("wiki.neverIndexed") : vault.indexedAt.slice(0, 19).replace("T", " ");
			const tabs = (0, react.useMemo)(() => [
				{
					id: "overview",
					label: t("wiki.tab.overview"),
					count: void 0
				},
				{
					id: "gaps",
					label: t("wiki.tab.gaps"),
					count: report?.graph.missingEntities
				},
				{
					id: "activity",
					label: t("wiki.tab.activity"),
					count: report?.usage.total
				}
			], [t, report]);
			/** The overview: what the vault is, and what its pages can answer. */
			const overview = report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: cn(panel_module_css_default$5.props),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
							className: cn(panel_module_css_default$5.propLabel),
							children: t("wiki.path")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: cn(panel_module_css_default$5.propValue),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: cn(panel_module_css_default.pathRow),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.mono),
									children: current?.path
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: cn(panel_module_css_default.copyBtn, copied === "copied" ? panel_module_css_default.copyOk : void 0, copied === "failed" ? panel_module_css_default.copyBad : void 0),
									"aria-label": copied === "copied" ? t("wiki.copied") : copied === "failed" ? t("wiki.copyFailed") : t("wiki.copyPath"),
									title: t("wiki.copyPath"),
									onClick: copyPath,
									children: copied === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckMark, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyMark, {})
								})]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
							className: cn(panel_module_css_default$5.propLabel),
							children: t("wiki.pages")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: cn(panel_module_css_default$5.propValue),
							children: current?.ready === true ? current.pages : "—"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
							className: cn(panel_module_css_default$5.propLabel),
							children: t("wiki.indexedAt")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: cn(panel_module_css_default$5.propValue),
							children: current?.ready === true ? when(current) : "—"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
							className: cn(panel_module_css_default$5.propLabel),
							children: t("wiki.indexBytes")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: cn(panel_module_css_default$5.propValue),
							children: report.indexBytes === void 0 ? "—" : bytes(report.indexBytes)
						}),
						rebuildMs !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
							className: cn(panel_module_css_default$5.propLabel),
							children: t("wiki.lastRebuild")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: cn(panel_module_css_default$5.propValue),
							children: `${rebuildMs} ms`
						})] })
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					className: cn(panel_module_css_default.subTitle),
					children: t("wiki.levels")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: cn(panel_module_css_default.levelList),
					children: report.levels.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LevelBar, {
						level: entry.level,
						pages: entry.pages,
						total: report.pages,
						t
					}, entry.level))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.levelHint")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					className: cn(panel_module_css_default.subTitle),
					children: t("wiki.connectivity")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default.statBlock),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("wiki.withOutgoing"),
							value: `${report.graph.withOutgoing}`,
							note: `/ ${report.pages}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("wiki.withIncoming"),
							value: `${report.graph.withIncoming}`,
							note: `/ ${report.pages}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("wiki.isolated"),
							value: `${report.graph.isolated}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("wiki.edges"),
							value: `${report.graph.resolvedEdges + report.graph.danglingEdges}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: cn(panel_module_css_default$5.note, panel_module_css_default.statFootnote),
							children: t("wiki.edgeDetail", {
								resolved: report.graph.resolvedEdges,
								dangling: report.graph.danglingEdges
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("wiki.missing"),
							value: `${report.graph.missingEntities}`
						})
					]
				})
			] });
			/** The gaps tab: what the pages keep citing and no page covers. */
			const gaps = report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					className: cn(panel_module_css_default.subTitle),
					children: t("wiki.gapsTitle")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.gapNote")
				}),
				report.gaps.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.noGaps")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: cn(panel_module_css_default.gapList),
					children: report.gaps.map((gap, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: cn(panel_module_css_default.gapItem),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default.gapRow),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.gapRank),
									children: index + 1
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.gapUri),
									children: gap.uri
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.gapCited),
									children: t("wiki.citedTimes", { count: gap.cited })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: cn(panel_module_css_default$5.foldToggle, panel_module_css_default.gapToggle),
									onClick: () => {
										toggleGap(gap.uri);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: openGap === gap.uri ? t("wiki.hideCiters") : t("wiki.showCiters") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: cn(panel_module_css_default.gapToggleGhost),
											"aria-hidden": "true",
											children: t("wiki.showCiters")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: cn(panel_module_css_default.gapToggleGhost),
											"aria-hidden": "true",
											children: t("wiki.hideCiters")
										})
									]
								})
							]
						}), openGap === gap.uri && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: cn(panel_module_css_default.citers),
							children: gapBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.note),
								children: t("wiki.citersLoading")
							}) : gapCiters.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.note),
								children: t("wiki.searchNoHit")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
								className: cn(panel_module_css_default.citerList),
								children: [gapCiters.slice(0, 40).map((page) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: cn(panel_module_css_default.citerLink),
									onClick: () => {
										openCard(page);
									},
									children: page
								}) }, page)), gapCiters.length > 40 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									className: cn(panel_module_css_default$5.note),
									children: t("wiki.citersMore", { count: gapCiters.length - 40 })
								})]
							})
						})]
					}, gap.uri))
				})
			] });
			/** The activity tab: what has been written, and what has been asked. */
			const activity = report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					className: cn(panel_module_css_default.subTitle),
					children: t("wiki.activityTotal", { count: report.usage.total })
				}),
				report.usage.total === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.noActivity")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default.stats),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default.termBlock),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default.statLabel),
							children: t("wiki.missedTerms")
						}), report.usage.misses.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$5.note),
							children: t("wiki.searchNoHit")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: cn(panel_module_css_default.termList),
							children: report.usage.misses.slice(0, 10).map((miss) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: cn(panel_module_css_default.termRow),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.termText),
									children: miss.term
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.termCount),
									children: t("wiki.times", { count: miss.count })
								})]
							}, miss.term))
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default.termBlock),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default.statLabel),
							children: t("wiki.topTerms")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: cn(panel_module_css_default.termList),
							children: report.usage.popular.slice(0, 10).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: cn(panel_module_css_default.termRow),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.termText),
									children: entry.term
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default.termCount),
									children: t("wiki.times", { count: entry.count })
								})]
							}, entry.term))
						})]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					className: cn(panel_module_css_default.subTitle),
					children: t("wiki.recent")
				}),
				recent.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.recentEmpty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: cn(panel_module_css_default.logList),
					children: recent.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: cn(panel_module_css_default.logRow),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default.logDate),
							children: entry.date
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default.logText),
							children: entry.text
						})]
					}, `${entry.date}-${String(index)}`))
				})
			] });
			/** One page as a card: what it can answer, and where it leads. */
			const cardView = card === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default.card),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default.cardHead),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.cardTitle),
								children: card.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.mono),
								children: card.uri ?? card.page
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: cn(panel_module_css_default.cardClose),
								onClick: () => {
									setCard(void 0);
								},
								children: t("wiki.hideCiters")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default.cardFacts),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.tag, card.level === "concept" ? panel_module_css_default$5.tagMuted : void 0),
								children: t(LEVEL_KEY[card.level])
							}),
							card.fieldCount !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.cardFact),
								children: t("wiki.cardFields", { count: card.fieldCount })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.cardFact),
								children: card.table === void 0 ? t("wiki.cardNoTable") : `${t("wiki.cardTable")} ${card.table}`
							}),
							card.version !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.cardFact),
								children: card.version
							})
						]
					}),
					card.lacks.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: cn(panel_module_css_default.lacks),
						children: card.lacks.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item }, item))
					}),
					card.outgoing.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", {
						className: cn(panel_module_css_default.cardSub),
						children: t("wiki.cardOutgoing")
					}), card.outgoing.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RelationRow, {
						group,
						t
					}, group.kind))] }),
					card.incomingGroups.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", {
						className: cn(panel_module_css_default.cardSub),
						children: t("wiki.cardIncoming")
					}), card.incomingGroups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RelationRow, {
						group,
						t
					}, group.kind))] }),
					card.unresolved.total > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.note),
						children: t("wiki.cardUnresolved", { count: card.unresolved.total })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cn(panel_module_css_default$5.note),
						children: card.page
					})
				]
			});
			/** Search results, shown in place of the tabs while a term is typed. */
			const results = found === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default.results),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default.resultHead),
					children: t("wiki.searchSummary", {
						scanned: found.scanned,
						hits: found.hits.length
					})
				}), found.hits.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.searchNoHit")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: cn(panel_module_css_default.resultList),
					children: found.hits.map((hit) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: cn(panel_module_css_default.resultRow),
						disabled: cardBusy !== void 0,
						onClick: () => {
							openCard(hit.page);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.resultName),
								children: hit.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default.mono),
								children: hit.uri ?? hit.page
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: cn(panel_module_css_default.resultFacts),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.tag, hit.level === "concept" ? panel_module_css_default$5.tagMuted : void 0),
										children: t(LEVEL_KEY[hit.level])
									}),
									hit.fieldCount !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("wiki.cardFields", { count: hit.fieldCount }) }),
									hit.table !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default.mono),
										children: hit.table
									})
								]
							})
						]
					}) }, hit.page))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: cn(panel_module_css_default$5.note),
					children: t("wiki.searchCardHint")
				})] })]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("wiki.title"),
				closeLabel: t("wiki.close"),
				className: cn(panel_module_css_default$5.manager),
				contentClassName: cn(panel_module_css_default$5.managerContent),
				children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: cn(panel_module_css_default$5.error),
					role: "alert",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$5.errorText),
						children: t("wiki.actionFailed", { message: failure })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$5.errorAction),
						onClick: () => {
							load();
						},
						children: t("wiki.retry")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default$5.body),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: cn(panel_module_css_default$5.listPane),
						"aria-label": t("wiki.list"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$5.listHead),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$5.listTitle),
								children: t("wiki.list")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: busy !== void 0 || vaults.length === 0,
								onClick: () => {
									rebuild();
								},
								children: busy === "*" ? t("wiki.rebuilding") : t("wiki.rebuildAll")
							})]
						}), loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: cn(panel_module_css_default$5.note),
							children: t("wiki.loading")
						}) : vaults.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: cn(panel_module_css_default$5.note),
							children: t("wiki.empty")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: cn(panel_module_css_default$5.projects),
							role: "listbox",
							"aria-label": t("wiki.list"),
							children: vaults.map((vault) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "option",
								"aria-selected": vault.id === current?.id,
								tabIndex: vault.id === tabbable ? 0 : -1,
								className: cn(panel_module_css_default$5.projectRow, !vault.ready ? panel_module_css_default.rowNotReady : void 0),
								onClick: () => {
									setSelected(vault.id);
									setCard(void 0);
									setTerm("");
									setOpenGap(void 0);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.projectMark),
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BookMark, {})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.projectName),
										title: vault.path,
										children: vault.label
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$5.projectMeta),
										children: vault.ready ? `${vault.pages} ${t("wiki.pagesUnit")}` : t("wiki.notReady")
									})
								]
							}) }, vault.id))
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: cn(panel_module_css_default$5.detailPane),
						children: current === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$5.empty),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.emptyMark),
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BookMark, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.emptyTitle),
									children: t("wiki.empty")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$5.note),
									children: t("wiki.emptyHint")
								})
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
								className: cn(panel_module_css_default.title),
								children: [current.label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.projectMeta),
									children: current.id
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default.searchRow),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: cn(panel_module_css_default$5.inputFill, panel_module_css_default.searchInput),
									type: "search",
									value: term,
									placeholder: t("wiki.searchPlaceholder"),
									"aria-label": t("wiki.search"),
									onChange: (event) => {
										setTerm(event.target.value);
									}
								}), searching && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$5.note),
									children: t("wiki.searching")
								})]
							}),
							results ?? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: cn(panel_module_css_default.tabs),
									role: "tablist",
									"aria-label": t("wiki.title"),
									children: tabs.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "tab",
										"aria-selected": tab === entry.id,
										className: cn(panel_module_css_default.tab, tab === entry.id ? panel_module_css_default.tabActive : void 0),
										onClick: () => {
											setTab(entry.id);
										},
										children: [entry.label, entry.count !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: cn(panel_module_css_default.tabCount),
											children: entry.count
										})]
									}, entry.id))
								}),
								tab === "overview" && overview,
								tab === "gaps" && gaps,
								tab === "activity" && activity
							] }),
							cardView,
							tab === "overview" && current.ready && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$5.hint),
								children: t("wiki.rebuildHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$5.detailActions),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									disabled: busy !== void 0 || !current.ready,
									onClick: () => {
										rebuild(current.id);
									},
									children: busy === current.id ? t("wiki.rebuilding") : t("wiki.rebuild")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									disabled: loading,
									onClick: () => {
										load();
									},
									children: t("wiki.refresh")
								})]
							})
						] })
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/WikiItem.tsx
		/**
		* The panel's fourth built-in entry: one row that opens the knowledge base
		* surface.
		*
		* Same gestures as its three siblings — a dialog rather than a region of the
		* 280px strip, the panel's own dismissals standing down while it is up, and focus
		* handed back to the row on close. The mark, the name it is given, and the
		* surface differ.
		*/
		/**
		* The entry's glyph: an open book with a bookmark, drawn here instead of imported
		* so the mark's shape does not track one harness release's icon set.
		* @returns the decorative svg.
		*/
		function WikiMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2.75 3.25h4.1c.66 0 1.15.53 1.15 1.18v8.32H3.9a1.15 1.15 0 0 1-1.15-1.15z",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M13.25 3.25h-4.1c-.66 0-1.15.53-1.15 1.18v8.32h4.1a1.15 1.15 0 0 0 1.15-1.15z",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 4.43c-.55-.55-1.3-.9-2.15-.9",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					})
				]
			});
		}
		/**
		* Render the entry row and, while open, the knowledge base surface.
		* @param props - composed slot props.
		* @returns the row, plus the dialog when it is showing.
		*/
		function WikiItem({ t, label, pushOverlay, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const announce = (0, react.useRef)(pushOverlay);
			announce.current = pushOverlay;
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				const release = announce.current();
				return () => {
					release();
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: panel_item_module_css_default.item,
				"data-active": open ? "" : void 0,
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				onClick: () => {
					setOpen((value) => !value);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WikiMark, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.label,
					children: label
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WikiManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\YonPanelRoot.module.css.mjs
		const css = ".Ua_2rq_action{align-items:center;display:flex}.Ua_2rq_trigger{cursor:pointer;background:0 0;border:0;border-radius:8px;justify-content:center;align-items:center;width:32px;height:32px;padding:0;display:inline-flex}.Ua_2rq_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.Ua_2rq_trigger[data-active]{background:var(--dsw-alias-interactive-bg-active)}.Ua_2rq_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Ua_2rq_mark{border:.5px solid var(--dsw-alias-label-primary);width:24px;height:24px;color:var(--dsw-alias-label-primary);box-sizing:border-box;user-select:none;border-radius:8px;justify-content:center;align-items:center;font-size:12px;font-weight:700;line-height:1;display:inline-flex}.Ua_2rq_panel{z-index:30;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:280px;max-height:min(60vh,480px);box-shadow:var(--dsw-elevation-panel);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;border-radius:12px;flex-direction:column;display:flex;position:fixed;overflow:hidden}.Ua_2rq_body{flex-direction:column;flex:1;gap:2px;min-height:0;padding:6px;display:flex;overflow-y:auto}";
		const tagId = "dsh-plugin-yon-panel/YonPanelRoot.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var YonPanelRoot_module_css_default = {
			"action": "Ua_2rq_action",
			"body": "Ua_2rq_body",
			"mark": "Ua_2rq_mark",
			"panel": "Ua_2rq_panel",
			"trigger": "Ua_2rq_trigger"
		};
		//#endregion
		//#region src/client/YonPanelRoot.tsx
		/** The Yon sidebar-foot action and the panel it opens above itself. */
		/**
		* The panel's style for the frame between opening and the first measurement.
		*
		* `visibility: hidden` still lays the element out, which is the point: the
		* anchor hook has to measure a real height to place an upward panel, and
		* `display: none` would measure zero and bring back the bug this guards against.
		*/
		const HIDDEN_UNTIL_PLACED = { visibility: "hidden" };
		/**
		* The trigger's glyph: a single-Y monogram in one icon-sized outlined block. It
		* is decorative — the button carries the accessible name — and both the border
		* and the letter take the theme's strongest foreground alias.
		* @returns the mark element.
		*/
		function YonMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: YonPanelRoot_module_css_default.mark,
				"aria-hidden": "true",
				children: "Y"
			});
		}
		/**
		* Render the trigger and, while open, its surface above the trigger. The panel
		* hangs upward because the action sits at the sidebar foot, with the settings
		* row below it; the sidebar clips overflow, so the panel is a fixed-position
		* element placed from the trigger's measured rect rather than from document
		* flow. The trigger keeps one icon cell in both column widths.
		* @param props - composed slot props.
		* @returns the trigger plus the open panel.
		*/
		function YonPanelRoot({ usePanel, useItems, onToggle, onSetOpen, renderSlot, t }) {
			const open = usePanel((snapshot) => snapshot.open);
			const overlayDepth = usePanel((snapshot) => snapshot.overlayDepth);
			const items = useItems((rows) => rows);
			const root = (0, react.useRef)(null);
			const panel = (0, react.useRef)(null);
			const anchor = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: root,
				panelRef: panel,
				side: "top",
				gap: 8,
				margin: 8
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(root, open && overlayDepth === 0, onSetOpen);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape" && overlayDepth === 0) onSetOpen(false);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [
				open,
				overlayDepth,
				onSetOpen
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: root,
				className: YonPanelRoot_module_css_default.action,
				children: [open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
					ref: panel,
					className: YonPanelRoot_module_css_default.panel,
					style: anchor ?? HIDDEN_UNTIL_PLACED,
					role: "dialog",
					"aria-label": t("panel.title"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: YonPanelRoot_module_css_default.body,
						children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderSlot("yon.panel.item", {
							open,
							label: item.label
						}, { only: item.id }) }, item.id))
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("trigger.label"),
					side: "right",
					delayMs: 400,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: YonPanelRoot_module_css_default.trigger,
						"data-active": open ? "" : void 0,
						"aria-expanded": open,
						"aria-label": t("trigger.aria"),
						onClick: onToggle,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(YonMark, {})
					})
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `yonPanel` namespace dictionaries.
		*
		* Copy rules this file follows: a control names its action ("新建项目", "添加"),
		* an error names the problem and the way back ("未保存，点这里重试"), and nothing
		* explains the implementation instead of the task.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"trigger.label": "Yon",
			"trigger.aria": "Yon 按钮面板",
			"panel.title": "Yon 按钮面板",
			"item.project": "项目管理",
			"item.skills": "技能",
			"item.datasource": "数据源",
			"item.wiki": "知识库",
			"project.title": "项目管理",
			"project.close": "关闭项目管理",
			"project.list": "项目",
			"project.new": "新建项目",
			"project.createTitle": "新建项目",
			"project.createHint": "名称必填；编码可以留空，建好后随时能改。",
			"project.createConfirm": "创建",
			"project.createBusy": "创建中…",
			"project.cancel": "取消",
			"project.name": "名称",
			"project.namePlaceholder": "例如：用友 NCC 客开",
			"project.renameProject": "改名称",
			"project.code": "编码",
			"project.codePlaceholder": "点击填写，例如 NCC-1",
			"project.codeEmpty": "未填写",
			"project.changeCode": "改编码",
			"project.status": "状态",
			"project.status.active": "进行中",
			"project.status.paused": "已暂停",
			"project.status.done": "已完成",
			"project.archived": "已归档",
			"project.showArchived": "显示已归档",
			"project.archive": "归档",
			"project.restore": "恢复",
			"project.remove": "彻底删除",
			"project.removeTitle": "彻底删除项目",
			"project.removeDescription": "将删除「{name}」及其全部 {count} 个字段。此操作无法撤销。",
			"project.removeAcknowledge": "我了解此操作无法撤销",
			"project.removeConfirm": "确认删除",
			"project.fields": "字段",
			"project.fieldsEmpty": "这个项目还没有字段",
			"project.fieldsHint": "字段名和值都由你定：值能按 JSON 解析就存 JSON，否则存文本。",
			"project.addField": "新增字段",
			"project.fieldKey": "字段名",
			"project.fieldKeyPlaceholder": "例如：环境信息",
			"project.fieldValue": "值",
			"project.fieldValuePlaceholder": "例如：10.0.0.1",
			"project.fieldAdd": "添加",
			"project.fieldRemove": "删除字段",
			"project.fieldRemoveConfirm": "删除字段「{name}」？",
			"project.fieldRemoveYes": "删除",
			"project.fieldSaving": "保存中…",
			"project.fieldSaved": "已保存",
			"project.fieldFailed": "未保存，点这里重试",
			"project.copyValue": "复制值",
			"project.copyValueLabel": "复制「{name}」的值",
			"project.copied": "已复制",
			"project.copyFailed": "复制失败",
			"project.search": "搜索项目",
			"project.searchEmpty": "没有匹配「{query}」的项目",
			"project.empty": "还没有项目",
			"project.emptyHint": "建一个项目，再给它加任意字段。",
			"project.pickHint": "从左边选一个项目，就能改它的属性和字段",
			"project.fieldCount": "{count} 个字段",
			"project.loading": "读取中…",
			"project.readFailed": "读取失败：{message}",
			"project.actionFailed": "操作失败：{message}",
			"project.retry": "重试",
			"skill.title": "技能",
			"skill.close": "关闭技能面板",
			"skill.list": "技能",
			"skill.mine": "插件提供",
			"skill.theirs": "其他全局技能",
			"skill.enabled": "已启用",
			"skill.disabled": "已停用",
			"skill.enable": "启用",
			"skill.disable": "停用",
			"skill.readonly": "只读",
			"skill.managedHint": "由插件提供：安装插件时它自动出现，卸载时自动消失，不会在你自己的技能目录里留下文件。",
			"skill.readonlyHint": "这个技能来自你自己的技能目录，面板只能查看，不会改动它。",
			"skill.description": "描述",
			"skill.whenToUse": "触发时机",
			"skill.source": "来源",
			"skill.body": "技能正文",
			"skill.unfold": "展开",
			"skill.fold": "收起",
			"skill.copyCode": "复制代码",
			"skill.copied": "已复制",
			"skill.footnotes": "脚注",
			"skill.search": "搜索技能",
			"skill.searchEmpty": "没有匹配「{query}」的技能",
			"skill.empty": "还没有可显示的技能",
			"skill.pickHint": "从左边选一个技能，查看它的用途和正文",
			"skill.partial": "部分技能来源未能读取，列表可能不完整。",
			"skill.scopeHint": "列表只含部署级注册的技能。你 ~/.agents/skills 里的技能由 agent 预设按会话加载，不在这里显示。",
			"skill.loading": "读取中…",
			"skill.readFailed": "读取失败：{message}",
			"skill.retry": "重试",
			"datasource.title": "数据源",
			"datasource.close": "关闭数据源面板",
			"datasource.list": "数据源",
			"datasource.new": "新增",
			"datasource.createTitle": "新增数据源",
			"datasource.editTitle": "编辑数据源",
			"datasource.key": "名称",
			"datasource.keyPlaceholder": "例如：天九(NCC2312)",
			"datasource.env": "环境",
			"datasource.envPlaceholder": "例如：test",
			"datasource.dbType": "数据库类型",
			"datasource.type": "类型",
			"datasource.host": "地址",
			"datasource.hostPlaceholder": "例如：10.0.0.1",
			"datasource.port": "端口",
			"datasource.portPlaceholder": "1521",
			"datasource.service": "库名",
			"datasource.servicePlaceholder": "Oracle 服务名或 MySQL 库名，可留空",
			"datasource.logins": "登录名",
			"datasource.userPlaceholder": "登录名",
			"datasource.password": "密码",
			"datasource.passwordPlaceholder": "留空表示不改动已保存的密码",
			"datasource.passwordStored": "已保存",
			"datasource.passwordNone": "未保存",
			"datasource.usersHint": "一个环境一个登录名；密码只写进来、不会再显示出来，换了登录名就把密码一起填上。",
			"datasource.binding": "项目",
			"datasource.bindingNone": "未绑定",
			"datasource.bindHint": "绑定后，模型查这个项目时就能看到对应的数据源。",
			"datasource.test": "测试连接",
			"datasource.testing": "测试中…",
			"datasource.testOk": "连通，用时 {ms} 毫秒",
			"datasource.testOkRows": "连通，用时 {ms} 毫秒，返回 {rows} 行",
			"datasource.testFailed": "失败：{message}",
			"datasource.noConnector": "查询脚本没有 {type} 的连接器，这条数据源只能登记、不能测试。",
			"datasource.probeUnavailable": "这个部署无法启动查询脚本，测试连接不可用。",
			"datasource.edit": "编辑",
			"datasource.remove": "删除",
			"datasource.removeConfirm": "删除「{key}」？",
			"datasource.removeYes": "删除",
			"datasource.cancel": "取消",
			"datasource.save": "保存",
			"datasource.saving": "保存中…",
			"datasource.search": "搜索数据源",
			"datasource.searchEmpty": "没有匹配「{query}」的数据源",
			"datasource.empty": "还没有数据源",
			"datasource.emptyHint": "新增一个数据库连接，之后就能在这里测试连通并绑定项目。",
			"datasource.pickHint": "从左边选一个数据源，查看连接信息和测试结果",
			"datasource.loading": "读取中…",
			"datasource.actionFailed": "操作失败：{message}",
			"datasource.retry": "重试",
			"datasource.partial": "配置文件无法解析，列表可能不完整。",
			"datasource.pathHint": "读取自 {path}",
			"datasource.seeded": "首次运行：已从 {path} 导入已有的数据源。",
			"wiki.title": "知识库",
			"wiki.close": "关闭知识库面板",
			"wiki.list": "知识库",
			"wiki.loading": "读取中…",
			"wiki.empty": "还没有登记知识库",
			"wiki.emptyHint": "在 ~/.dsh/yon-panel/wiki_config.json 里登记 Obsidian vault 的绝对路径。",
			"wiki.path": "路径",
			"wiki.pages": "页数",
			"wiki.pagesUnit": "页",
			"wiki.indexedAt": "索引时间",
			"wiki.state": "状态",
			"wiki.ready": "就绪",
			"wiki.neverIndexed": "尚未建索引",
			"wiki.notReady": "路径不可用",
			"wiki.rebuild": "重建索引",
			"wiki.rebuilding": "重建中…",
			"wiki.rebuildAll": "全部重建",
			"wiki.refresh": "刷新",
			"wiki.recent": "最近写入",
			"wiki.recentEmpty": "这个库还没有写入记录。",
			"wiki.rebuildHint": "索引存在 vault 内（wiki/.yon-index.json），整库约 3 秒可重建。新增或编辑页面后重建一次就能查到。",
			"wiki.actionFailed": "操作失败：{message}",
			"wiki.retry": "重试",
			"wiki.tab.overview": "概览",
			"wiki.tab.gaps": "缺口",
			"wiki.tab.activity": "活动",
			"wiki.indexBytes": "索引大小",
			"wiki.lastRebuild": "上次重建耗时",
			"wiki.copyPath": "复制路径",
			"wiki.copied": "已复制",
			"wiki.copyFailed": "复制失败",
			"wiki.levels": "页面能力分布",
			"wiki.level.query-ready": "可写查询",
			"wiki.level.locatable": "可定位",
			"wiki.level.concept": "仅概念",
			"wiki.levelHint": "可写查询＝有表名也有字段清单，能直接写 SQL；可定位＝只有表名，列名得另查；仅概念＝连表名都没有。",
			"wiki.connectivity": "连通度",
			"wiki.withOutgoing": "引用别人",
			"wiki.withIncoming": "被别人引用",
			"wiki.isolated": "与其他实体都不相连",
			"wiki.edges": "引用边",
			"wiki.edgeDetail": "{resolved} 条落到具体页面，{dangling} 条指向没有页面的实体",
			"wiki.missing": "被引用却没有页面的实体",
			"wiki.gapsTitle": "被引用最多、却最缺页面的",
			"wiki.citedTimes": "被引用 {count} 次",
			"wiki.showCiters": "看谁引用它",
			"wiki.hideCiters": "收起",
			"wiki.citersLoading": "读取中…",
			"wiki.noGaps": "没有缺口 —— 页面引用的实体全都有页面。",
			"wiki.activityTotal": "共 {count} 次调用",
			"wiki.noActivity": "还没有查询记录。日志从装好这一版之后开始积累，查得越多越准。",
			"wiki.missedTerms": "查了却没有结果",
			"wiki.topTerms": "查得最多的词",
			"wiki.times": "{count} 次",
			"wiki.gapNote": "这份清单要读，不能当待办直接执行：排在前面的多是平台基础接口（IYTenant、LogicDelete 一类），它们属于平台而不属于某个业务实体。",
			"wiki.search": "搜索页面",
			"wiki.searchPlaceholder": "实体 URI / 物理表名 / 中文名",
			"wiki.searching": "搜索中…",
			"wiki.searchNoHit": "没有匹配的页面。换用实体 URI、物理表名或中文名试试。",
			"wiki.searchSummary": "扫描 {scanned} 页，匹配 {hits} 个",
			"wiki.searchCardHint": "点一个结果，看它能不能写 SQL、以及和哪些实体相连。",
			"wiki.cardNoTable": "无物理表名",
			"wiki.cardTable": "物理表",
			"wiki.citersMore": "还有 {count} 个页面",
			"wiki.cardFields": "{count} 个字段",
			"wiki.cardLacks": "注意",
			"wiki.cardOutgoing": "这一页指向",
			"wiki.cardIncoming": "指向这一页",
			"wiki.cardUnresolved": "其中 {count} 个目标在知识库里没有页面",
			"wiki.kind.reference": "关联属性",
			"wiki.kind.refType": "关联引用",
			"wiki.kind.implements": "继承接口",
			"wiki.kind.composition": "子表",
			"wiki.kind.depends": "依赖接口",
			"wiki.kind.extends": "父实体",
			"wiki.kind.parent": "父实体",
			"wiki.kind.other": "其他",
			"item.digest": "消化检查",
			"digest.title": "消化检查记录",
			"digest.close": "关闭检查记录",
			"digest.tallyTotal": "次检查",
			"digest.tallyPass": "合格",
			"digest.tallyFail": "不合格",
			"digest.tallyPlan": "摸底",
			"digest.tallyGate": "门禁",
			"digest.tallySweep": "体检",
			"digest.refresh": "刷新",
			"digest.loading": "读取中…",
			"digest.loadingList": "读取记录中…",
			"digest.retry": "重试",
			"digest.actionFailed": "读取失败：{message}",
			"digest.filterAll": "全部",
			"digest.filterFail": "只看不合格",
			"digest.filterPass": "只看合格",
			"digest.averageHint": "均分取自 {count} 次有判定的验收——单次判定说明不了什么，趋势才说明问题。",
			"digest.averageNone": "还没有可算均值的验收记录。",
			"digest.empty": "还没有检查记录。跑一次 digest_audit 就会出现在这里。",
			"digest.emptyFiltered": "没有符合条件的记录。",
			"digest.since": "最早一条：{at}",
			"digest.showing": "列表显示最近 {shown} 条（账本共 {total} 条）",
			"digest.logAt": "日志：",
			"digest.fieldLabel": "对象",
			"digest.fieldSource": "源文档",
			"digest.fieldProduct": "产物",
			"digest.fieldSize": "体积",
			"digest.fieldMs": "耗时",
			"digest.failedItems": "未通过：",
			"digest.helpToggle": "怎么读这些数字",
			"digest.helpIntro": "每跑一次检查就在这里记一条。上面的计数是账本总量，中间的均分取自最近有判定的那些验收，下面是逐条记录——点任意一条可以看到它的九项明细与未通过项。",
			"digest.helpAboutPlan": "摸底只看这份文档分几章、每章从哪行到哪行，不判定好坏，所以没有分数。",
			"digest.helpAboutGate": "门禁在消化前判断这份素材值不值得做——只算它与已有知识库的重叠度。产物就是源文档自己，所以各项覆盖率必然满分，那些数字没有意义，面板不显示它们。",
			"digest.helpAboutAudit": "验收把产物与源文档逐项比对，判定项全过才算合格。体积只提示，英文标识符与约束句只报数——它们不参与判定。",
			"digest.helpAboutSweep": "体检按产物自己声明的源文档分组，一次扫一个目录里的所有产物，并标出哪些组从来没有被验收过。",
			"digest.helpThreshold": "每项都有阈值，低于阈值就是不合格项。均分是「最近若干次验收的平均表现」——看趋势，不看单次。",
			"digest.aboutPlan": "摸底：分几章、每章从哪行到哪行。不判定",
			"digest.aboutGate": "门禁：消化前判断值不值得做。不产生分数",
			"digest.aboutAudit": "验收：产物与源文档逐项比对，判定项全过才算合格",
			"digest.aboutSweep": "体检：一次扫一个目录里的所有产物",
			"digest.metricTermsAbout": "源文档里的中文术语有多少进了产物。阈值 85%",
			"digest.metricIdentifiersAbout": "类名、字段名、表名这类标识符的覆盖率。它不进判定——只用来发现「产物里满是源文档没有的名字」",
			"digest.metricLevel1About": "源文档的一级章节有多少能在产物里找到。阈值 85%",
			"digest.metricLevel2About": "源文档的二级小节有多少能在产物里找到。阈值 60%",
			"digest.metricConstraintsAbout": "含「必须 / 禁止 / 不支持」的句子有多少进了产物。最容易被摘要吃掉，又最不能丢。它不进判定——抽取本身带噪声，拿噪声主导的比例当门槛会误判。",
			"digest.metricFidelityAbout": "产物里的标识符有多少能在源文档找到——这一项是防幻觉的。阈值 98%",
			"digest.metricProvenanceAbout": "产物里有多少小节标了页码出处。阈值 50%",
			"digest.metricOverlapAbout": "与已有知识库的重复度，越高越不值得做。消化前跑的；判定时排掉本次产物自身，否则量到的是「产物与自己」。阈值 ≤85%",
			"digest.metricAddressableAbout": "源文档的术语能否在产物里定位到。阈值 70%",
			"digest.noSample": "这一项还没有样本：只有跑过带判定的验收才会算均值。",
			"item.home": "Home 管理",
			"home.title": "Home 管理",
			"home.close": "关闭 Home 管理",
			"home.list": "已登记",
			"home.new": "登记一个",
			"home.search": "按名称、路径或版本搜索",
			"home.showing": "显示 {shown} / {total}",
			"home.searchEmpty": "没有匹配「{query}」的登记",
			"home.empty": "还没有登记安装目录。",
			"home.emptyWhy": "登记之后，模型就能自己去查这个安装目录里的源码、配置和 .bmf 元数据，不必每开一次会话就问一次路径。",
			"home.emptyHow": "路径填安装根目录——即 modules/ 的上一级，例如 E:/NCProject/NCC2111/home。",
			"home.loading": "读取中…",
			"home.loadFailed": "读取失败：{message}",
			"home.retry": "重试",
			"home.actionFailed": "{message}",
			"home.pickOne": "在左边选一个安装目录，或者登记一个新的。",
			"home.notReady": "路径读不出来",
			"home.defaultTag": "默认",
			"home.path": "路径",
			"home.copy": "复制路径",
			"home.copied": "已复制",
			"home.copyFailed": "复制失败",
			"home.mirror": "同步到技能：",
			"home.mirrorWarn": "未同步（{message}）",
			"home.configPath": "登记文件：",
			"home.probeTitle": "探测结果",
			"home.probedAt": "探测于 {at}",
			"home.never": "还没探测过。选「重新探测」看这个目录里有什么。",
			"home.shape": "目录类型",
			"home.shape.ncc-home": "NCC 安装目录",
			"home.shape.bip-home": "BIP 安装目录",
			"home.shape.jar-collection": "只是 jar 集合",
			"home.shape.not-found": "不像安装目录",
			"home.modules": "模块",
			"home.jars": "jar 文件",
			"home.atLeast": "≥",
			"home.probed": "{shape}：{modules} 个模块，{jars} 个 jar",
			"home.probedCapped": "{shape}；扫描到了上限，两个数字都只是「至少」",
			"home.keyPaths": "关键路径",
			"home.keyYes": "有",
			"home.keyNo": "无",
			"home.probeNote": "探测只数目录名、不打开 jar，所以是秒级；数字后面带 ≥ 表示已到扫描上限。",
			"home.indexTitle": "类索引",
			"home.indexNone": "这个版本还没有建索引。",
			"home.indexLine": "{classes} 个类 · {size} · {at} 建",
			"home.metaTitle": "元数据索引",
			"home.metaNone": "这个版本还没有建元数据索引，ncc_meta_find / ncc_meta_detail 就用不了。",
			"home.metaLine": "{entities} 个实体 · {fields} 个字段 · {enums} 个枚举 · {size} · {at} 建",
			"home.metaWhy": "把安装目录里 modules/*/METADATA 的 .bmf 拍平成一张可查的表：实体叫什么、对应哪张表、有哪些字段、字段的中文名、枚举取值。建一次约几秒。",
			"home.metaBuild": "建立元数据索引",
			"home.metaRebuild": "重建元数据索引",
			"home.metaBuilding": "建立中…",
			"home.metaProgress": "已解析 {parsed} / {total} 个文件（共 {files} 个）",
			"home.metaFresh": "与安装目录一致。",
			"home.metaStale": "与安装目录不一致：{changed} 个改动、{added} 个新增、{removed} 个删除，答案可能过时。",
			"home.metaFailed": "建立失败：{error}",
			"home.metaFrom": "来源：",
			"home.newTitle": "登记安装目录",
			"home.editTitle": "编辑登记",
			"home.createHint": "目录用「选择目录…」挑，要挑安装根目录（modules/ 的上一级）。版本从预置里选：目录里没有可信的版本串，探测器不猜。",
			"home.editHint": "编辑改的是这条登记的内容，登记本身不变。",
			"home.pathLabel": "路径",
			"home.pathNone": "尚未选择目录",
			"home.pickDir": "选择目录…",
			"home.picking": "选择中…",
			"home.pickUnavailable": "这个宿主没有可用的目录选择器（面板从局域网地址或 SSH 打开时会是这样），在这台机器上登记不了 Home；请在能弹出文件对话框的那台机器上登记，或手改 home_config.json。",
			"home.product": "产品线",
			"home.product.ncc": "NCC（NC Cloud）",
			"home.product.bip": "旗舰版（BIP）",
			"home.version": "版本",
			"home.versionPick": "选择版本…",
			"home.versionPlaceholder": "例如：2405",
			"home.versionOther": "其他（手输）",
			"home.versionHint": "一个版本一个 Home：名字就是「产品线+版本」，技能侧的类索引也是按版本存的。",
			"home.setDefault": "设为默认（查类时不写版本就用它）",
			"home.save": "保存并探测",
			"home.saving": "保存中…",
			"home.probing": "探测中…",
			"home.cancel": "取消",
			"home.edit": "编辑",
			"home.probe": "重新探测",
			"home.makeDefault": "设为默认",
			"home.remove": "删除",
			"home.removeAsk": "删掉这条登记？",
			"home.removeYes": "确认删除",
			"home.removeAbout": "删除后模型查不到这个目录，但技能那边的索引文件不会被删。"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"trigger.label": "Yon",
			"trigger.aria": "Yon button panel",
			"panel.title": "Yon button panel",
			"item.project": "Project management",
			"item.skills": "Skills",
			"item.datasource": "Data sources",
			"item.wiki": "Knowledge base",
			"project.title": "Projects",
			"project.close": "Close project management",
			"project.list": "Projects",
			"project.new": "New project",
			"project.createTitle": "New project",
			"project.createHint": "A name is required; the code can stay empty and be filled in later.",
			"project.createConfirm": "Create",
			"project.createBusy": "Creating…",
			"project.cancel": "Cancel",
			"project.name": "Name",
			"project.namePlaceholder": "e.g. YonBIP rollout",
			"project.renameProject": "Rename project",
			"project.code": "Code",
			"project.codePlaceholder": "Click to fill in, e.g. NCC-1",
			"project.codeEmpty": "Not set",
			"project.changeCode": "Change code",
			"project.status": "Status",
			"project.status.active": "Active",
			"project.status.paused": "Paused",
			"project.status.done": "Done",
			"project.archived": "Archived",
			"project.showArchived": "Show archived",
			"project.archive": "Archive",
			"project.restore": "Restore",
			"project.remove": "Delete permanently",
			"project.removeTitle": "Delete project permanently",
			"project.removeDescription": "This deletes “{name}” and all {count} of its fields. It cannot be undone.",
			"project.removeAcknowledge": "I understand this cannot be undone",
			"project.removeConfirm": "Delete for good",
			"project.fields": "Fields",
			"project.fieldsEmpty": "This project has no fields yet",
			"project.fieldsHint": "Name and value are both yours: a value that parses as JSON is stored as JSON, anything else as text.",
			"project.addField": "Add field",
			"project.fieldKey": "Field",
			"project.fieldKeyPlaceholder": "e.g. Environment",
			"project.fieldValue": "Value",
			"project.fieldValuePlaceholder": "e.g. 10.0.0.1",
			"project.fieldAdd": "Add",
			"project.fieldRemove": "Remove field",
			"project.fieldRemoveConfirm": "Remove field “{name}”?",
			"project.fieldRemoveYes": "Remove",
			"project.fieldSaving": "Saving…",
			"project.fieldSaved": "Saved",
			"project.fieldFailed": "Not saved — click to retry",
			"project.copyValue": "Copy value",
			"project.copyValueLabel": "Copy the value of “{name}”",
			"project.copied": "Copied",
			"project.copyFailed": "Copy failed",
			"project.search": "Search projects",
			"project.searchEmpty": "No project matches “{query}”",
			"project.empty": "No projects yet",
			"project.emptyHint": "Create one, then give it whatever fields you need.",
			"project.pickHint": "Pick a project on the left to edit its properties and fields",
			"project.fieldCount": "{count} fields",
			"project.loading": "Loading…",
			"project.readFailed": "Could not load: {message}",
			"project.actionFailed": "That did not work: {message}",
			"project.retry": "Retry",
			"skill.title": "Skills",
			"skill.close": "Close the skill panel",
			"skill.list": "Skills",
			"skill.mine": "Shipped by this plugin",
			"skill.theirs": "Other global skills",
			"skill.enabled": "On",
			"skill.disabled": "Off",
			"skill.enable": "Turn on",
			"skill.disable": "Turn off",
			"skill.readonly": "Read-only",
			"skill.managedHint": "Shipped by this plugin: it appears when the plugin is installed and goes away with it, leaving no file in your own skill directories.",
			"skill.readonlyHint": "This skill lives in your own skill directory. The panel can show it, and will not change it.",
			"skill.description": "Description",
			"skill.whenToUse": "When to use",
			"skill.source": "Source",
			"skill.body": "Instructions",
			"skill.unfold": "Show more",
			"skill.fold": "Show less",
			"skill.copyCode": "Copy code",
			"skill.copied": "Copied",
			"skill.footnotes": "Footnotes",
			"skill.search": "Search skills",
			"skill.searchEmpty": "No skill matches “{query}”",
			"skill.empty": "No skills to show",
			"skill.pickHint": "Pick a skill on the left to read what it does",
			"skill.partial": "Some skill sources could not be read, so this list may be incomplete.",
			"skill.scopeHint": "Only deployment-level skills appear here. The ones in ~/.agents/skills load per session through an agent preset, so they are not shown.",
			"skill.loading": "Loading…",
			"skill.readFailed": "Could not load: {message}",
			"skill.retry": "Retry",
			"datasource.title": "Data sources",
			"datasource.close": "Close the datasource panel",
			"datasource.list": "Data sources",
			"datasource.new": "New",
			"datasource.createTitle": "New data source",
			"datasource.editTitle": "Edit data source",
			"datasource.key": "Name",
			"datasource.keyPlaceholder": "e.g. 天九(NCC2312)",
			"datasource.env": "Environment",
			"datasource.envPlaceholder": "e.g. test",
			"datasource.dbType": "Database type",
			"datasource.type": "Type",
			"datasource.host": "Address",
			"datasource.hostPlaceholder": "e.g. 10.0.0.1",
			"datasource.port": "Port",
			"datasource.portPlaceholder": "1521",
			"datasource.service": "Database",
			"datasource.servicePlaceholder": "Oracle service name or MySQL database; may be empty",
			"datasource.logins": "Login",
			"datasource.userPlaceholder": "Login name",
			"datasource.password": "Password",
			"datasource.passwordPlaceholder": "Leave blank to keep the stored password",
			"datasource.passwordStored": "Stored",
			"datasource.passwordNone": "Not stored",
			"datasource.usersHint": "One login per environment. A password is written only, never shown again — fill it in whenever you change the login.",
			"datasource.binding": "Project",
			"datasource.bindingNone": "Not bound",
			"datasource.bindHint": "Once bound, the model sees this connection when it works on that project.",
			"datasource.test": "Test connection",
			"datasource.testing": "Testing…",
			"datasource.testOk": "Connected in {ms} ms",
			"datasource.testOkRows": "Connected in {ms} ms, {rows} row(s) back",
			"datasource.testFailed": "Failed: {message}",
			"datasource.noConnector": "The query script has no connector for {type}, so this connection can be recorded but not tested.",
			"datasource.probeUnavailable": "This deployment cannot start the query script, so testing is unavailable.",
			"datasource.edit": "Edit",
			"datasource.remove": "Delete",
			"datasource.removeConfirm": "Delete “{key}”?",
			"datasource.removeYes": "Delete",
			"datasource.cancel": "Cancel",
			"datasource.save": "Save",
			"datasource.saving": "Saving…",
			"datasource.search": "Search data sources",
			"datasource.searchEmpty": "No data source matches “{query}”",
			"datasource.empty": "No data sources yet",
			"datasource.emptyHint": "Add one, then test its connection and bind it to a project here.",
			"datasource.pickHint": "Pick a data source on the left to see its connection and test it",
			"datasource.loading": "Loading…",
			"datasource.actionFailed": "That did not work: {message}",
			"datasource.retry": "Retry",
			"datasource.partial": "The configuration file could not be parsed, so this list may be incomplete.",
			"datasource.pathHint": "Read from {path}",
			"datasource.seeded": "First run: adopted the data sources already in {path}.",
			"wiki.title": "Knowledge base",
			"wiki.close": "Close the knowledge base panel",
			"wiki.list": "Knowledge base",
			"wiki.loading": "Loading…",
			"wiki.empty": "No knowledge base registered yet",
			"wiki.emptyHint": "Register the absolute path of an Obsidian vault in ~/.dsh/yon-panel/wiki_config.json.",
			"wiki.path": "Path",
			"wiki.pages": "Pages",
			"wiki.pagesUnit": "pages",
			"wiki.indexedAt": "Indexed",
			"wiki.state": "State",
			"wiki.ready": "Ready",
			"wiki.neverIndexed": "not indexed yet",
			"wiki.notReady": "path unavailable",
			"wiki.rebuild": "Rebuild index",
			"wiki.rebuilding": "Rebuilding…",
			"wiki.rebuildAll": "Rebuild all",
			"wiki.refresh": "Refresh",
			"wiki.recent": "Recent writes",
			"wiki.recentEmpty": "Nothing has been written into this vault yet.",
			"wiki.rebuildHint": "The index lives inside the vault (wiki/.yon-index.json); a full rebuild takes about three seconds. Rebuild once after adding or editing pages.",
			"wiki.actionFailed": "That did not work: {message}",
			"wiki.retry": "Retry",
			"wiki.tab.overview": "Overview",
			"wiki.tab.gaps": "Gaps",
			"wiki.tab.activity": "Activity",
			"wiki.indexBytes": "Index size",
			"wiki.lastRebuild": "Last rebuild",
			"wiki.copyPath": "Copy path",
			"wiki.copied": "Copied",
			"wiki.copyFailed": "Copy failed",
			"wiki.levels": "What the pages can answer",
			"wiki.level.query-ready": "Query-ready",
			"wiki.level.locatable": "Locatable",
			"wiki.level.concept": "Concept only",
			"wiki.levelHint": "Query-ready means a table and its field list, enough to write SQL; locatable means the table without its columns; concept only means no table at all.",
			"wiki.connectivity": "Connectivity",
			"wiki.withOutgoing": "Cite something",
			"wiki.withIncoming": "Cited by something",
			"wiki.isolated": "Connected to nothing",
			"wiki.edges": "Reference edges",
			"wiki.edgeDetail": "{resolved} reach a page; {dangling} name an entity no page covers",
			"wiki.missing": "Cited but uncovered entities",
			"wiki.gapsTitle": "Most cited, least covered",
			"wiki.citedTimes": "cited {count} times",
			"wiki.showCiters": "See who cites it",
			"wiki.hideCiters": "Hide",
			"wiki.citersLoading": "Loading…",
			"wiki.noGaps": "No gaps — every entity the pages cite has a page.",
			"wiki.activityTotal": "{count} calls",
			"wiki.noActivity": "Nothing has been asked yet. The log starts accumulating once this version is installed; the more it is used, the truer it gets.",
			"wiki.missedTerms": "Asked for and not found",
			"wiki.topTerms": "Asked most often",
			"wiki.times": "{count}×",
			"wiki.gapNote": "Read this list rather than working it: the largest entries are platform interfaces (IYTenant, LogicDelete and the like), which belong to the platform rather than to any business entity.",
			"wiki.search": "Search pages",
			"wiki.searchPlaceholder": "entity URI / physical table / display name",
			"wiki.searching": "Searching…",
			"wiki.searchNoHit": "No page matched. Try the entity URI, the physical table name, or the Chinese display name.",
			"wiki.searchSummary": "scanned {scanned} pages, matched {hits}",
			"wiki.searchCardHint": "Pick a result to see whether it can answer a query and what it connects to.",
			"wiki.cardNoTable": "no physical table",
			"wiki.cardTable": "table",
			"wiki.citersMore": "{count} more pages",
			"wiki.cardFields": "{count} fields",
			"wiki.cardLacks": "Note",
			"wiki.cardOutgoing": "This page points at",
			"wiki.cardIncoming": "Pointing at this page",
			"wiki.cardUnresolved": "{count} of those targets have no page in the vault",
			"wiki.kind.reference": "foreign key",
			"wiki.kind.refType": "reference type",
			"wiki.kind.implements": "implements",
			"wiki.kind.composition": "child tables",
			"wiki.kind.depends": "depends on",
			"wiki.kind.extends": "super entity",
			"wiki.kind.parent": "parent entity",
			"wiki.kind.other": "other",
			"item.digest": "Digestion checks",
			"digest.title": "Digestion checks",
			"digest.close": "Close the digestion checks",
			"digest.tallyTotal": "checks",
			"digest.tallyPass": "passed",
			"digest.tallyFail": "failed",
			"digest.tallyPlan": "plans",
			"digest.tallyGate": "gates",
			"digest.tallySweep": "sweeps",
			"digest.refresh": "Refresh",
			"digest.loading": "Reading…",
			"digest.loadingList": "Reading the ledger…",
			"digest.retry": "Retry",
			"digest.actionFailed": "Could not read the ledger: {message}",
			"digest.filterAll": "All",
			"digest.filterFail": "Failed only",
			"digest.filterPass": "Passed only",
			"digest.averageHint": "Each metric averaged over the {count} audits that produced a verdict — one verdict says little, the trend says the rest.",
			"digest.averageNone": "No audits yet to average.",
			"digest.empty": "No checks recorded yet. Run digest_audit once and it shows up here.",
			"digest.emptyFiltered": "No entries match the filter.",
			"digest.since": "Oldest entry: {at}",
			"digest.showing": "Showing the latest {shown} rows (the ledger holds {total})",
			"digest.logAt": "Ledger: ",
			"digest.fieldLabel": "Subject",
			"digest.fieldSource": "Source",
			"digest.fieldProduct": "Product",
			"digest.fieldSize": "Size",
			"digest.fieldMs": "Took",
			"digest.failedItems": "Failed: ",
			"digest.helpToggle": "How to read these numbers",
			"digest.helpIntro": "Every check you run appends one row here. The counts above are the whole ledger; the averages in the middle come from the most recent audits that produced a verdict; the rows below are the checks themselves — open any one to see its nine figures and what failed.",
			"digest.helpAboutPlan": "A plan only reports how many chapters the document has and where each one starts. It judges nothing, so it has no score.",
			"digest.helpAboutGate": "A gate runs before digesting to decide whether the material is worth doing — it only compares it against the existing knowledge base. Its product IS the source document, so every coverage figure is necessarily 100%; those numbers mean nothing and the panel does not show them.",
			"digest.helpAboutAudit": "An audit compares the pages against the source item by item. Every judging check must pass. Volume only warns, and English identifiers and constraint sentences are reported without being judged.",
			"digest.helpAboutSweep": "A sweep groups pages by the source their own frontmatter declares, checks a whole directory at once, and marks the groups that have never been audited.",
			"digest.helpThreshold": "Every metric has a threshold, and falling below it is what makes an audit fail. The averages are how the last several audits went on average — read the trend, not one verdict.",
			"digest.aboutPlan": "A plan: chapters and line ranges. Judges nothing",
			"digest.aboutGate": "A gate: is this material worth digesting? Produces no score",
			"digest.aboutAudit": "An audit: pages vs source, item by item. Every judging check must pass",
			"digest.aboutSweep": "A sweep: every page in a directory, at once",
			"digest.metricTermsAbout": "How much of the source's Chinese terminology reached the pages. Threshold 85%",
			"digest.metricIdentifiersAbout": "Coverage of identifiers: class names, field names, table names. Not a pass/fail item — it is what exposes \"the pages are full of names the source never had\"",
			"digest.metricLevel1About": "How many of the source's top-level chapters can be found in the pages. Threshold 85%",
			"digest.metricLevel2About": "How many of the source's subsections can be found in the pages. Threshold 60%",
			"digest.metricConstraintsAbout": "How many sentences saying must / must not / not supported reached the pages. A summary eats these first and they matter most. Not a pass/fail item — extraction noise dominates its ratio.",
			"digest.metricFidelityAbout": "How many identifiers in the pages can be found in the source — this is the anti-fabrication check. Threshold 98%",
			"digest.metricProvenanceAbout": "How many sections cite a page number. Threshold 50%",
			"digest.metricOverlapAbout": "Overlap with the existing knowledge base; higher means less worth doing. Measured before digesting; the pages from this run are excluded from the verdict, or the figure would be measuring the product against itself. Threshold ≤85%",
			"digest.metricAddressableAbout": "Whether the source's terms can be located in the pages. Threshold 70%",
			"digest.noSample": "No sample for this one yet: only audits that produced a verdict are averaged.",
			"item.home": "Home",
			"home.title": "Home manager",
			"home.close": "Close Home manager",
			"home.list": "Registered",
			"home.new": "Register one",
			"home.search": "Search by name, path or version",
			"home.showing": "Showing {shown} of {total}",
			"home.searchEmpty": "Nothing matches \"{query}\"",
			"home.empty": "No installation registered yet.",
			"home.emptyWhy": "Once one is registered, the model can look inside it by itself — sources, configuration and .bmf metadata — instead of asking for the path in every new conversation.",
			"home.emptyHow": "The path is the installation root: the directory holding modules/, for example E:/NCProject/NCC2111/home.",
			"home.loading": "Reading…",
			"home.loadFailed": "Could not read: {message}",
			"home.retry": "Retry",
			"home.actionFailed": "{message}",
			"home.pickOne": "Pick an installation on the left, or register a new one.",
			"home.notReady": "Path unreadable",
			"home.defaultTag": "Default",
			"home.path": "Path",
			"home.copy": "Copy path",
			"home.copied": "Copied",
			"home.copyFailed": "Copy failed",
			"home.mirror": "Mirrored to skills:",
			"home.mirrorWarn": "not mirrored ({message})",
			"home.configPath": "Registration file:",
			"home.probeTitle": "Probe",
			"home.probedAt": "Probed {at}",
			"home.never": "Not probed yet. Use \"Probe again\" to see what is inside.",
			"home.shape": "Kind",
			"home.shape.ncc-home": "NCC installation",
			"home.shape.bip-home": "BIP installation",
			"home.shape.jar-collection": "A jar collection",
			"home.shape.not-found": "Does not look like an installation",
			"home.modules": "Modules",
			"home.jars": "Jar files",
			"home.atLeast": "≥",
			"home.probed": "{shape}: {modules} modules, {jars} jars",
			"home.probedCapped": "{shape}; the walk hit its cap, so both figures are lower bounds",
			"home.keyPaths": "Standard paths",
			"home.keyYes": "present",
			"home.keyNo": "missing",
			"home.probeNote": "A probe counts directory names and opens no jars, so it takes seconds; a figure prefixed with ≥ means the walk hit its cap.",
			"home.indexTitle": "Class index",
			"home.indexNone": "No index built for this version.",
			"home.indexLine": "{classes} classes · {size} · built {at}",
			"home.metaTitle": "Metadata index",
			"home.metaNone": "No metadata index for this version, so ncc_meta_find / ncc_meta_detail cannot answer.",
			"home.metaLine": "{entities} entities · {fields} fields · {enums} enums · {size} · built {at}",
			"home.metaWhy": "Flattens the .bmf files under modules/*/METADATA into something queryable: what each entity is called, its table, its fields, their Chinese labels, and the values of each enumeration. A build takes a few seconds.",
			"home.metaBuild": "Build metadata index",
			"home.metaRebuild": "Rebuild metadata index",
			"home.metaBuilding": "Building…",
			"home.metaProgress": "Parsed {parsed} of {total} files ({files} found)",
			"home.metaFresh": "Matches the installation.",
			"home.metaStale": "Does not match the installation: {changed} changed, {added} added, {removed} removed. Answers may be out of date.",
			"home.metaFailed": "Build failed: {error}",
			"home.metaFrom": "Sources:",
			"home.newTitle": "Register an installation",
			"home.editTitle": "Edit registration",
			"home.createHint": "Pick the folder with \"Choose a folder…\": it has to be the installation root (the directory holding modules/). The version comes from the list: nothing in the directory states it reliably, so the probe does not guess.",
			"home.editHint": "Editing changes what this registration says, not which registration it is.",
			"home.pathLabel": "Path",
			"home.pathNone": "No folder chosen yet",
			"home.pickDir": "Choose a folder…",
			"home.picking": "Choosing…",
			"home.pickUnavailable": "This host has no folder chooser available (that happens when the panel is reached over a LAN address or SSH), so a Home cannot be registered from here; register it on the machine that can open the dialog, or edit home_config.json by hand.",
			"home.product": "Product line",
			"home.product.ncc": "NCC (NC Cloud)",
			"home.product.bip": "YonBIP (flagship)",
			"home.version": "Version",
			"home.versionPick": "Pick a version…",
			"home.versionPlaceholder": "For example: 2405",
			"home.versionOther": "Other (type one)",
			"home.versionHint": "One version is one Home: the name is its product line and version, and the class index on the skills side is stored per version.",
			"home.setDefault": "Make default (a class search without a version uses it)",
			"home.save": "Save and probe",
			"home.saving": "Saving…",
			"home.probing": "Probing…",
			"home.cancel": "Cancel",
			"home.edit": "Edit",
			"home.probe": "Probe again",
			"home.makeDefault": "Make default",
			"home.remove": "Remove",
			"home.removeAsk": "Remove this registration?",
			"home.removeYes": "Remove it",
			"home.removeAbout": "Removing it hides the directory from the model, but the index file on the skills side is left alone."
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "yonPanel";
		/** Required services: the slot registry and this plugin's own copy. */
		const inject = ["slots", "locale"];
		/**
		* Client plugin body: the sidebar footer-action entry with its declared button
		* seat.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "yon-panel: dictionaries");
			const panel = createYonPanelStore();
			const itemRows = createYonPanelItemRows(ctx);
			ctx.effect(() => () => {
				itemRows.dispose();
			}, "yon-panel: item rows");
			const projectApi = createProjectApi();
			const skillApi = createSkillApi();
			const dataSourceApi = createDataSourceApi();
			const wikiApi = createWikiApi();
			const digestApi = createDigestApi();
			const homeApi = createHomeApi();
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "yon-btn",
				order: 10,
				locale: NS,
				children: { "yon.panel.item": {
					kind: "list",
					scope: "root"
				} },
				inject: () => ({
					hooks: {
						panel,
						items: itemRows
					},
					onToggle: () => {
						panel.toggle();
					},
					onSetOpen: (open) => {
						if (open) panel.open();
						else panel.close();
					}
				})
			}, YonPanelRoot));
			ctx.slots.inject("yon.panel.item", () => ctx.slots.register({
				name: "yon.panel.item",
				id: "project",
				order: 10,
				locale: NS,
				label: () => t("item.project"),
				inject: () => ({
					...projectApi,
					pushOverlay: () => panel.pushOverlay()
				})
			}, ProjectItem));
			ctx.slots.inject("yon.panel.item", () => ctx.slots.register({
				name: "yon.panel.item",
				id: "skills",
				order: 20,
				locale: NS,
				label: () => t("item.skills"),
				inject: () => ({
					...skillApi,
					pushOverlay: () => panel.pushOverlay()
				})
			}, SkillItem));
			ctx.slots.inject("yon.panel.item", () => ctx.slots.register({
				name: "yon.panel.item",
				id: "datasources",
				order: 30,
				locale: NS,
				label: () => t("item.datasource"),
				inject: () => ({
					...dataSourceApi,
					listProjects: projectApi.listProjects,
					pushOverlay: () => panel.pushOverlay()
				})
			}, DataSourceItem));
			ctx.slots.inject("yon.panel.item", () => ctx.slots.register({
				name: "yon.panel.item",
				id: "wiki",
				order: 40,
				locale: NS,
				label: () => t("item.wiki"),
				inject: () => ({
					...wikiApi,
					pushOverlay: () => panel.pushOverlay()
				})
			}, WikiItem));
			ctx.slots.inject("yon.panel.item", () => ctx.slots.register({
				name: "yon.panel.item",
				id: "digest",
				order: 50,
				locale: NS,
				label: () => t("item.digest"),
				inject: () => ({
					...digestApi,
					pushOverlay: () => panel.pushOverlay()
				})
			}, DigestItem));
			ctx.slots.inject("yon.panel.item", () => ctx.slots.register({
				name: "yon.panel.item",
				id: "home",
				order: 60,
				locale: NS,
				label: () => t("item.home"),
				inject: () => ({
					...homeApi,
					pushOverlay: () => panel.pushOverlay()
				})
			}, HomeItem));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map