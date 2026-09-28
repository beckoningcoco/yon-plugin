window.__ModuleLoader__.load({
	id: "dsh-plugin-yon-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
		//#region src/shared/types.ts
		/** Every status, in display order (the client renders these as options). */
		const PROJECT_STATUSES = [
			"active",
			"paused",
			"done"
		];
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
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\panel.module.css.mjs
		const css$3 = ".ll1Rqa_manager.ll1Rqa_manager{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);width:min(680px,100%);max-height:calc(100vh - 48px)}.ll1Rqa_managerContent{min-height:0}.ll1Rqa_body{align-items:stretch;gap:16px;height:min(62vh,520px);display:flex}.ll1Rqa_manager :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.ll1Rqa_listPane{border-right:.5px solid var(--dsw-alias-border-l1);flex-direction:column;flex:none;gap:6px;width:212px;min-height:0;padding-right:16px;display:flex}.ll1Rqa_listHead{flex:none;justify-content:space-between;align-items:center;gap:8px;min-height:28px;display:flex}.ll1Rqa_listTitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.ll1Rqa_projects{flex-direction:column;flex:1;gap:2px;min-height:0;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}.ll1Rqa_projectRow{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;align-items:center;gap:8px;padding:6px 8px;font-family:inherit;font-size:13px;line-height:18px;display:flex}.ll1Rqa_projectRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.ll1Rqa_projectRow[aria-selected=true]{background:var(--dsw-alias-interactive-bg-active)}.ll1Rqa_projectRow[data-archived]{color:var(--dsw-alias-label-tertiary)}.ll1Rqa_projectMark{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex}.ll1Rqa_projectName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.ll1Rqa_projectCode{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;font-size:12px;line-height:16px}.ll1Rqa_projectMeta{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}.ll1Rqa_projectArchived{border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);border-radius:4px;flex:none;padding:0 4px;font-size:11px;line-height:14px}.ll1Rqa_archivedToggle{border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);cursor:pointer;flex:none;align-items:center;gap:6px;margin-top:2px;padding-top:8px;font-size:12px;line-height:16px;display:inline-flex}.ll1Rqa_archivedToggle input{accent-color:var(--dsw-alias-button-primary-fill);margin:0}.ll1Rqa_detailPane{flex-direction:column;flex:1;gap:10px;min-width:0;min-height:0;padding-right:2px;display:flex;overflow-y:auto}.ll1Rqa_empty{text-align:center;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:10px;padding:24px 16px;display:flex}.ll1Rqa_emptyMark{color:var(--dsw-alias-label-dimmed);display:inline-flex}.ll1Rqa_emptyTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;line-height:18px}.ll1Rqa_note{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:16px}.ll1Rqa_hint{color:var(--dsw-alias-label-tertiary);margin:2px 0 0;font-size:12px;line-height:16px}.ll1Rqa_inlineText{box-sizing:border-box;text-align:left;cursor:text;background:0 0;border:.5px solid #0000;border-radius:6px;width:100%;margin:0;padding:2px 6px;font-family:inherit;display:block}.ll1Rqa_inlineText:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}.ll1Rqa_inlineText:disabled{cursor:default}.ll1Rqa_inlineTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}.ll1Rqa_inlineValue{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}.ll1Rqa_inlineEmpty{color:var(--dsw-alias-label-dimmed)}.ll1Rqa_detailName{min-width:0}.ll1Rqa_props{grid-template-columns:48px minmax(0,1fr);align-items:center;gap:6px 10px;margin:0;display:grid}.ll1Rqa_propLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.ll1Rqa_propValue{min-width:0;margin:0}.ll1Rqa_statusGroup{flex-wrap:wrap;gap:4px;display:inline-flex}.ll1Rqa_statusGroup>button:disabled{opacity:.5;cursor:not-allowed}.ll1Rqa_detailActions{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.ll1Rqa_dangerButton.ll1Rqa_dangerButton{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}.ll1Rqa_dangerButton.ll1Rqa_dangerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.ll1Rqa_rule{border:0;border-top:.5px solid var(--dsw-alias-border-l1);height:0;margin:2px 0}.ll1Rqa_fields{flex-direction:column;gap:6px;display:flex}.ll1Rqa_fieldsHead{justify-content:space-between;align-items:center;gap:8px;min-height:28px;display:flex}.ll1Rqa_sectionTitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.ll1Rqa_fieldRow{align-items:center;gap:8px;min-height:32px;display:flex}.ll1Rqa_fieldKey{text-overflow:ellipsis;white-space:nowrap;width:96px;color:var(--dsw-alias-label-secondary);flex:none;font-size:12px;line-height:16px;overflow:hidden}.ll1Rqa_inputFill{width:100%;min-width:0;display:flex}.ll1Rqa_fieldRow .ll1Rqa_inputFill{flex:1}.ll1Rqa_rowState{width:52px;color:var(--dsw-alias-label-tertiary);text-align:right;flex:none;font-size:12px;line-height:16px}.ll1Rqa_rowFailed{max-width:150px;color:var(--dsw-alias-state-error-primary);text-align:right;cursor:pointer;background:0 0;border:0;flex:none;padding:0 4px;font-family:inherit;font-size:12px;line-height:16px;text-decoration:underline dotted}.ll1Rqa_rowIcon{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;font-family:inherit;font-size:16px;line-height:1;display:inline-flex}.ll1Rqa_rowIcon:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ll1Rqa_rowIcon:disabled{opacity:.4;cursor:not-allowed}.ll1Rqa_rowRemove:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}.ll1Rqa_rowCopied,.ll1Rqa_rowCopied:not(:disabled):hover{color:var(--dsw-alias-state-success-primary)}.ll1Rqa_rowCopyFailed,.ll1Rqa_rowCopyFailed:not(:disabled):hover{color:var(--dsw-alias-state-error-primary)}.ll1Rqa_draftKey.ll1Rqa_draftKey{flex:none;width:96px}.ll1Rqa_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;align-items:center;gap:8px;margin:0;padding:6px 10px;font-size:12px;line-height:16px;display:flex}.ll1Rqa_errorText{flex:1;min-width:0}.ll1Rqa_errorAction{color:inherit;cursor:pointer;background:0 0;border:0;flex:none;padding:0;font-family:inherit;font-size:12px;line-height:16px;text-decoration:underline}.ll1Rqa_form{flex-direction:column;gap:12px;display:flex}.ll1Rqa_formRow{flex-direction:column;gap:4px;display:flex}.ll1Rqa_formLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}.ll1Rqa_formError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:16px}";
		const tagId$3 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var panel_module_css_default$1 = {
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
			"fields": "ll1Rqa_fields",
			"fieldsHead": "ll1Rqa_fieldsHead",
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
			"projectArchived": "ll1Rqa_projectArchived",
			"projectCode": "ll1Rqa_projectCode",
			"projectMark": "ll1Rqa_projectMark",
			"projectMeta": "ll1Rqa_projectMeta",
			"projectName": "ll1Rqa_projectName",
			"projectRow": "ll1Rqa_projectRow",
			"projects": "ll1Rqa_projects",
			"propLabel": "ll1Rqa_propLabel",
			"propValue": "ll1Rqa_propValue",
			"props": "ll1Rqa_props",
			"rowCopied": "ll1Rqa_rowCopied",
			"rowCopyFailed": "ll1Rqa_rowCopyFailed",
			"rowFailed": "ll1Rqa_rowFailed",
			"rowIcon": "ll1Rqa_rowIcon",
			"rowRemove": "ll1Rqa_rowRemove",
			"rowState": "ll1Rqa_rowState",
			"rule": "ll1Rqa_rule",
			"sectionTitle": "ll1Rqa_sectionTitle",
			"statusGroup": "ll1Rqa_statusGroup"
		};
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
					className: cn(panel_module_css_default$1.form),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$1.formRow),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$1.formLabel),
								children: t("project.name")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$1.inputFill),
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
							className: cn(panel_module_css_default$1.formRow),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$1.formLabel),
								children: t("project.code")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$1.inputFill),
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
							className: cn(panel_module_css_default$1.formError),
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
		* Removing a field asks first, in the same small dialog the rest of the product
		* uses for a destructive act; the row's own cross only opens it.
		*/
		/** How long the "saved" note stays on a row before the row goes quiet again. */
		const SAVED_LINGER_MS = 1600;
		/** How long the copy button holds its result before going quiet again. */
		const COPY_LINGER_MS = 1600;
		/**
		* The copy glyph: two offset frames, drawn here rather than imported so the mark
		* does not track one harness release's icon names.
		* @returns the decorative svg.
		*/
		function CopyMark() {
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
		function CheckMark() {
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
		* Render one field: its name as the row label, its value editable in place.
		* @param props - field identity, stored value, row state, and the row's verbs.
		* @returns the row.
		*/
		function FieldRow({ fieldKey, value, state, t, onSave, onRetry, onAskRemove }) {
			const [text, setText] = (0, react.useState)(() => formatValue(value));
			const [copy, setCopy] = (0, react.useState)();
			const copyTimer = (0, react.useRef)();
			(0, react.useEffect)(() => {
				setText(formatValue(value));
			}, [value]);
			(0, react.useEffect)(() => () => {
				if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
			}, []);
			/** Put the row's current text on the clipboard and say what happened. */
			const copyValue = () => {
				const settleCopy = (outcome) => {
					setCopy(outcome);
					if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
					copyTimer.current = setTimeout(() => {
						setCopy(void 0);
					}, COPY_LINGER_MS);
				};
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((accepted) => {
					settleCopy(accepted ? "copied" : "failed");
				}, () => {
					settleCopy("failed");
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cn(panel_module_css_default$1.fieldRow),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$1.fieldKey),
						title: fieldKey,
						children: fieldKey
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						className: cn(panel_module_css_default$1.inputFill),
						"aria-label": `${fieldKey} · ${t("project.fieldValue")}`,
						"aria-invalid": state === "failed",
						value: text,
						onChange: (event) => {
							setText(event.target.value);
						},
						onBlur: () => {
							if (text !== formatValue(value)) onSave(text);
						},
						onKeyDown: (event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							event.currentTarget.blur();
						}
					}),
					state === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$1.rowFailed),
						onClick: () => {
							onRetry(text);
						},
						children: t("project.fieldFailed")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$1.rowState),
						role: "status",
						children: state === "saving" ? t("project.fieldSaving") : state === "saved" ? t("project.fieldSaved") : ""
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$1.rowIcon, copy === "copied" ? panel_module_css_default$1.rowCopied : void 0, copy === "failed" ? panel_module_css_default$1.rowCopyFailed : void 0),
						"aria-label": copy === "copied" ? t("project.copied") : copy === "failed" ? t("project.copyFailed") : t("project.copyValueLabel", { name: fieldKey }),
						title: t("project.copyValue"),
						disabled: text === "",
						onClick: copyValue,
						children: copy === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckMark, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyMark, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$1.rowIcon, panel_module_css_default$1.rowRemove),
						"aria-label": `${t("project.fieldRemove")}: ${fieldKey}`,
						title: t("project.fieldRemove"),
						onClick: onAskRemove,
						children: "×"
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
				className: cn(panel_module_css_default$1.fields),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default$1.fieldsHead),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$1.sectionTitle),
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
						className: cn(panel_module_css_default$1.note),
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
						className: cn(panel_module_css_default$1.fieldRow),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: cn(panel_module_css_default$1.inputFill, panel_module_css_default$1.draftKey),
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
								className: cn(panel_module_css_default$1.inputFill),
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
								className: cn(panel_module_css_default$1.rowIcon),
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
						className: cn(panel_module_css_default$1.hint),
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
							className: cn(panel_module_css_default$1.dangerButton),
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
						panel_module_css_default$1.inlineText,
						variant === "title" ? panel_module_css_default$1.inlineTitle : panel_module_css_default$1.inlineValue,
						value === "" ? panel_module_css_default$1.inlineEmpty : "",
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
				className: [panel_module_css_default$1.inputFill, className].filter(Boolean).join(" "),
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
					className: cn(panel_module_css_default$1.manager),
					contentClassName: cn(panel_module_css_default$1.managerContent),
					children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: cn(panel_module_css_default$1.error),
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cn(panel_module_css_default$1.errorText),
							children: t("project.readFailed", { message: failure })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn(panel_module_css_default$1.errorAction),
							onClick: () => {
								load();
							},
							children: t("project.retry")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cn(panel_module_css_default$1.body),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: cn(panel_module_css_default$1.listPane),
							"aria-label": t("project.list"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cn(panel_module_css_default$1.listHead),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$1.listTitle),
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
									className: cn(panel_module_css_default$1.inputFill),
									"aria-label": t("project.search"),
									placeholder: t("project.search"),
									value: query,
									onChange: (event) => {
										setQuery(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									ref: list,
									className: cn(panel_module_css_default$1.projects),
									role: "listbox",
									"aria-label": t("project.list"),
									onKeyDown: onListKeyDown,
									children: visible.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "option",
										"aria-selected": project.projectId === selected?.projectId,
										tabIndex: project.projectId === tabbableId ? 0 : -1,
										className: cn(panel_module_css_default$1.projectRow),
										"data-project": project.projectId,
										"data-archived": project.archived ? "" : void 0,
										onClick: () => {
											select(project.projectId);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$1.projectMark),
												"aria-hidden": "true",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectMark, {})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$1.projectName),
												title: project.name,
												children: project.name
											}),
											project.code !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$1.projectCode),
												children: project.code
											}),
											project.fieldCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$1.projectMeta),
												children: t("project.fieldCount", { count: project.fieldCount })
											}),
											project.archived && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$1.projectArchived),
												children: t("project.archived")
											})
										]
									}) }, project.projectId))
								}),
								needle !== "" && visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default$1.note),
									children: t("project.searchEmpty", { query: query.trim() })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: cn(panel_module_css_default$1.archivedToggle),
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
							className: cn(panel_module_css_default$1.detailPane),
							children: selected === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default$1.empty),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cn(panel_module_css_default$1.emptyMark),
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectMark, { size: 28 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cn(panel_module_css_default$1.emptyTitle),
										children: projects.length === 0 ? t("project.empty") : t("project.pickHint")
									}),
									projects.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cn(panel_module_css_default$1.note),
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
									className: cn(panel_module_css_default$1.detailName),
									value: selected.name,
									label: t("project.renameProject"),
									placeholder: t("project.namePlaceholder"),
									disabled: busy,
									onCommit: (next) => {
										patch({ name: next });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: cn(panel_module_css_default$1.props),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
											className: cn(panel_module_css_default$1.propLabel),
											children: t("project.code")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$1.propValue),
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
											className: cn(panel_module_css_default$1.propLabel),
											children: t("project.status")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: cn(panel_module_css_default$1.propValue),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: cn(panel_module_css_default$1.statusGroup),
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
									className: cn(panel_module_css_default$1.detailActions),
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
										className: cn(panel_module_css_default$1.dangerButton),
										disabled: busy,
										onClick: () => {
											setAcknowledged(false);
											setConfirmingRemove(true);
										},
										children: t("project.remove")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", { className: cn(panel_module_css_default$1.rule) }),
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
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\panel-item.module.css.mjs
		const css$2 = "._0Xs8da_cell{display:inline-flex}._0Xs8da_item{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:8px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._0Xs8da_item:hover,._0Xs8da_item[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._0Xs8da_item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}";
		const tagId$2 = "dsh-plugin-yon-panel/panel-item.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var panel_item_module_css_default = {
			"cell": "_0Xs8da_cell",
			"item": "_0Xs8da_item"
		};
		//#endregion
		//#region src/client/ProjectItem.tsx
		/**
		* The panel's built-in entry: one icon cell that opens the project surface.
		*
		* The surface is a dialog rather than a region of the panel body — a 280px strip
		* cannot hold a list beside a field table — and this entry owns it, so opening it
		* needs no cross-seat coordination. While the surface is up the entry also tells
		* the panel to stand down, and when it closes the entry hands focus back to the
		* cell that opened it.
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
		* Render the entry cell and, while open, the project surface.
		* @param props - composed slot props.
		* @returns the cell, plus the dialog when it is showing.
		*/
		function ProjectItem({ t, pushOverlay, ...api }) {
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("item.project"),
				side: "bottom",
				delayMs: 300,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.cell,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						ref: trigger,
						type: "button",
						className: panel_item_module_css_default.item,
						"data-active": open ? "" : void 0,
						"aria-label": t("item.project"),
						"aria-expanded": open,
						"aria-haspopup": "dialog",
						onClick: () => {
							setOpen((value) => !value);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderMark, {})
					})
				})
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
		const css$1 = "._72vL5W_title{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:0 0 6px;font-size:15px;font-weight:600;display:flex}._72vL5W_groups{flex-direction:column;gap:10px;display:flex}._72vL5W_group{letter-spacing:.04em;color:var(--dsw-alias-label-tertiary);margin:0 0 4px;padding:0 2px;font-size:11px;font-weight:600}._72vL5W_rowOff{opacity:.55}._72vL5W_body{border:.5px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);max-height:300px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:6px;margin:0;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.65;overflow:auto}";
		const tagId$1 = "dsh-plugin-yon-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"body": "_72vL5W_body",
			"group": "_72vL5W_group",
			"groups": "_72vL5W_groups",
			"rowOff": "_72vL5W_rowOff",
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
				className: cn(panel_module_css_default$1.projectRow, skill.managed && !skill.enabled ? panel_module_css_default.rowOff : void 0),
				"data-skill": skill.name,
				onClick: () => {
					select(skill.name);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$1.projectMark),
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillMark, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$1.projectName),
						title: skill.name,
						children: skill.name
					}),
					skill.managed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$1.projectMeta),
						children: skill.enabled ? t("skill.enabled") : t("skill.disabled")
					})
				]
			}) }, skill.name);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: t("skill.title"),
				closeLabel: t("skill.close"),
				className: cn(panel_module_css_default$1.manager),
				contentClassName: cn(panel_module_css_default$1.managerContent),
				children: [failure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: cn(panel_module_css_default$1.error),
					role: "alert",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cn(panel_module_css_default$1.errorText),
						children: t("skill.readFailed", { message: failure })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cn(panel_module_css_default$1.errorAction),
						onClick: () => {
							load();
						},
						children: t("skill.retry")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cn(panel_module_css_default$1.body),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: cn(panel_module_css_default$1.listPane),
						"aria-label": t("skill.list"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cn(panel_module_css_default$1.listHead),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$1.listTitle),
									children: t("skill.list")
								})
							}),
							skills.length >= SEARCH_THRESHOLD && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								type: "search",
								className: cn(panel_module_css_default$1.inputFill),
								"aria-label": t("skill.search"),
								placeholder: t("skill.search"),
								value: query,
								onChange: (event) => {
									setQuery(event.target.value);
								}
							}),
							!complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$1.note),
								children: t("skill.partial")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cn(panel_module_css_default.groups),
								children: [mine.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default.group),
									children: t("skill.mine")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									ref: list,
									className: cn(panel_module_css_default$1.projects),
									role: "listbox",
									"aria-label": t("skill.mine"),
									onKeyDown: onListKeyDown,
									children: mine.map(row)
								})] }), theirs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: cn(panel_module_css_default.group),
									children: t("skill.theirs")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: cn(panel_module_css_default$1.projects),
									role: "listbox",
									"aria-label": t("skill.theirs"),
									onKeyDown: onListKeyDown,
									children: theirs.map(row)
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$1.note),
								children: t("skill.scopeHint")
							}),
							needle !== "" && visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$1.note),
								children: t("skill.searchEmpty", { query: query.trim() })
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: cn(panel_module_css_default$1.detailPane),
						children: selected === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cn(panel_module_css_default$1.empty),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cn(panel_module_css_default$1.emptyMark),
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillMark, { size: 28 })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$1.emptyTitle),
								children: loading ? t("skill.loading") : skills.length === 0 ? t("skill.empty") : t("skill.pickHint")
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
								className: cn(panel_module_css_default.title),
								children: [selected.name, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cn(panel_module_css_default$1.projectMeta),
									children: selected.managed ? selected.enabled ? t("skill.enabled") : t("skill.disabled") : t("skill.readonly")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: cn(panel_module_css_default$1.note),
								children: selected.managed ? t("skill.managedHint") : t("skill.readonlyHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: cn(panel_module_css_default$1.props),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$1.propLabel),
										children: t("skill.description")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$1.propValue),
										children: selected.description
									}),
									selected.whenToUse !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$1.propLabel),
										children: t("skill.whenToUse")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$1.propValue),
										children: selected.whenToUse
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
										className: cn(panel_module_css_default$1.propLabel),
										children: t("skill.source")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
										className: cn(panel_module_css_default$1.propValue),
										children: selected.source
									})
								]
							}),
							selected.managed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cn(panel_module_css_default$1.detailActions),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: selected.enabled ? "outline" : "primary",
									size: "sm",
									disabled: busy,
									onClick: toggle,
									children: selected.enabled ? t("skill.disable") : t("skill.enable")
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", { className: cn(panel_module_css_default$1.rule) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								className: cn(panel_module_css_default$1.sectionTitle),
								children: t("skill.body")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								className: cn(panel_module_css_default.body),
								children: selected.content
							})
						] })
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/SkillItem.tsx
		/**
		* The panel's second built-in entry: one icon cell that opens the skill surface.
		*
		* Like the project cell it owns the dialog it opens, so opening it needs no
		* cross-seat coordination and the panel's own dismissals stand down while it is
		* up. The two cells are one visual part by construction — they share the entry
		* stylesheet — because a panel whose buttons are laid out differently from each
		* other reads as two features that happened to land in the same box.
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
		* Render the entry cell and, while open, the skill surface.
		* @param props - composed slot props.
		* @returns the cell, plus the dialog when it is showing.
		*/
		function SkillItem({ t, pushOverlay, ...api }) {
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("item.skills"),
				side: "bottom",
				delayMs: 300,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_item_module_css_default.cell,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						ref: trigger,
						type: "button",
						className: panel_item_module_css_default.item,
						"data-active": open ? "" : void 0,
						"aria-label": t("item.skills"),
						"aria-expanded": open,
						"aria-haspopup": "dialog",
						onClick: () => {
							setOpen((value) => !value);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DocMark, {})
					})
				})
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillManager, {
				t,
				onClose: () => {
					setOpen(false);
				},
				...api
			})] });
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\YonPanelRoot.module.css.mjs
		const css = ".Ua_2rq_action{align-items:center;display:flex}.Ua_2rq_trigger{cursor:pointer;background:0 0;border:0;border-radius:8px;justify-content:center;align-items:center;width:32px;height:32px;padding:0;display:inline-flex}.Ua_2rq_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.Ua_2rq_trigger[data-active]{background:var(--dsw-alias-interactive-bg-active)}.Ua_2rq_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Ua_2rq_mark{border:.5px solid var(--dsw-alias-label-primary);width:24px;height:24px;color:var(--dsw-alias-label-primary);box-sizing:border-box;user-select:none;border-radius:7px;justify-content:center;align-items:center;font-size:12px;font-weight:700;line-height:1;display:inline-flex}.Ua_2rq_panel{z-index:30;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:280px;max-height:min(60vh,480px);box-shadow:var(--dsw-elevation-panel);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;border-radius:12px;flex-direction:column;display:flex;position:fixed;overflow:hidden}.Ua_2rq_body{flex-wrap:wrap;flex:1;align-content:flex-start;gap:4px;min-height:0;padding:8px;display:flex;overflow-y:auto}";
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
		function YonPanelRoot({ usePanel, onToggle, onSetOpen, renderSlot, t }) {
			const open = usePanel((snapshot) => snapshot.open);
			const overlayDepth = usePanel((snapshot) => snapshot.overlayDepth);
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
						children: renderSlot("yon.panel.item", { open })
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
			"item.skills": "YONSKILL",
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
			"skill.search": "搜索技能",
			"skill.searchEmpty": "没有匹配「{query}」的技能",
			"skill.empty": "还没有可显示的技能",
			"skill.pickHint": "从左边选一个技能，查看它的用途和正文",
			"skill.partial": "部分技能来源未能读取，列表可能不完整。",
			"skill.scopeHint": "列表只含部署级注册的技能。你 ~/.agents/skills 里的技能由 agent 预设按会话加载，不在这里显示。",
			"skill.loading": "读取中…",
			"skill.readFailed": "读取失败：{message}",
			"skill.retry": "重试"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"trigger.label": "Yon",
			"trigger.aria": "Yon button panel",
			"panel.title": "Yon button panel",
			"item.project": "Project management",
			"item.skills": "YONSKILL",
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
			"skill.search": "Search skills",
			"skill.searchEmpty": "No skill matches “{query}”",
			"skill.empty": "No skills to show",
			"skill.pickHint": "Pick a skill on the left to read what it does",
			"skill.partial": "Some skill sources could not be read, so this list may be incomplete.",
			"skill.scopeHint": "Only deployment-level skills appear here. The ones in ~/.agents/skills load per session through an agent preset, so they are not shown.",
			"skill.loading": "Loading…",
			"skill.readFailed": "Could not load: {message}",
			"skill.retry": "Retry"
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
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "yon-panel: dictionaries");
			const panel = createYonPanelStore();
			const projectApi = createProjectApi();
			const skillApi = createSkillApi();
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
					hooks: { panel },
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
				inject: () => ({
					...skillApi,
					pushOverlay: () => panel.pushOverlay()
				})
			}, SkillItem));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map