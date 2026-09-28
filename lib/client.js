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
		* its snapshot reference changes only when the open state actually moves.
		* @returns the panel store.
		*/
		function createYonPanelStore() {
			let snapshot = { open: false };
			const listeners = /* @__PURE__ */ new Set();
			const publish = (open) => {
				if (snapshot.open === open) return;
				snapshot = { open };
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
				}
			};
		}
		//#endregion
		//#region src/shared/types.ts
		/** Where the API lives, shared by the host's route table and the client's calls. */
		const API_PREFIX = "/yon/api";
		//#endregion
		//#region src/client/project/api.ts
		/**
		* The browser half's only route to the store: thin calls against `/yon/api`.
		*
		* It lives outside the components on purpose. The apply world builds one of
		* these and hands the methods to components through an inject face, so a
		* component never fetches, never subscribes, and never learns a URL.
		*/
		/** One failed call, carrying the API's machine code. */
		var ProjectApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "ProjectApiError";
			}
		};
		/**
		* Perform one JSON call, turning a non-2xx answer into {@link ProjectApiError}.
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
				throw new ProjectApiError(typeof failure.code === "string" ? failure.code : `http-${response.status}`, typeof failure.message === "string" && failure.message !== "" ? failure.message : `HTTP ${response.status}`);
			}
			return body;
		}
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
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\project\ProjectManager.module.css.mjs
		const css$2 = ".cPOj3W_surface{z-index:40;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(620px,100vw - 32px);max-height:min(72vh,560px);box-shadow:var(--dsw-elevation-panel);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;border-radius:12px;flex-direction:column;display:flex;position:fixed;top:72px;left:50%;overflow:hidden;transform:translate(-50%)}.cPOj3W_header{box-sizing:border-box;flex:none;align-items:center;gap:10px;min-height:42px;padding:8px 10px 8px 14px;display:flex}.cPOj3W_title{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px}.cPOj3W_toggle{color:var(--dsw-alias-label-tertiary);cursor:pointer;align-items:center;gap:6px;margin-left:auto;font-size:12px;line-height:16px;display:inline-flex}.cPOj3W_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-warn-label);border-radius:8px;flex:none;margin:0 14px 8px;padding:6px 10px;font-size:12px;line-height:16px}.cPOj3W_body{flex:1;gap:12px;min-height:0;padding:0 14px 14px;display:flex}.cPOj3W_listPane{flex-direction:column;flex:none;gap:8px;width:236px;min-height:0;display:flex}.cPOj3W_detailPane{flex-direction:column;flex:1;gap:8px;min-width:0;min-height:0;display:flex;overflow-y:auto}.cPOj3W_createRow,.cPOj3W_addRow{flex:none;gap:6px;display:flex}.cPOj3W_createRow .cPOj3W_input{min-width:0}.cPOj3W_projects{flex:1;min-height:0;margin:0;padding:0;list-style:none;overflow-y:auto}.cPOj3W_projectRow{width:100%;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;align-items:baseline;gap:8px;padding:6px 8px;font-family:inherit;font-size:13px;line-height:18px;display:flex}.cPOj3W_projectRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.cPOj3W_projectRow[data-selected]{background:var(--dsw-alias-interactive-bg-active)}.cPOj3W_projectRow[data-archived]{color:var(--dsw-alias-label-tertiary)}.cPOj3W_projectName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.cPOj3W_projectCode{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:16px}.cPOj3W_projectMeta{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}.cPOj3W_detailHead{flex-wrap:wrap;flex:none;align-items:baseline;gap:8px;display:flex}.cPOj3W_detailName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;overflow:hidden}.cPOj3W_status{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}.cPOj3W_sectionTitle{color:var(--dsw-alias-label-tertiary);flex:none;margin:4px 0 0;font-size:12px;font-weight:400;line-height:16px}.cPOj3W_fields{flex-direction:column;gap:4px;display:flex}.cPOj3W_fieldRow{align-items:center;gap:8px;display:flex}.cPOj3W_fieldKey{text-overflow:ellipsis;white-space:nowrap;width:104px;color:var(--dsw-alias-label-secondary);flex:none;font-size:12px;line-height:16px;overflow:hidden}.cPOj3W_input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);min-width:0;height:28px;color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;flex:1;padding:0 8px;font-family:inherit;font-size:12px;line-height:16px}.cPOj3W_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.cPOj3W_input:disabled{color:var(--dsw-alias-label-tertiary)}.cPOj3W_primary{background:var(--dsw-alias-button-floating-hover);height:28px;color:var(--dsw-alias-label-primary);white-space:nowrap;cursor:pointer;border:0;border-radius:8px;flex:none;padding:0 10px;font-family:inherit;font-size:12px;line-height:16px}.cPOj3W_primary:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.cPOj3W_primary:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-active)}.cPOj3W_link{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;padding:0;font-family:inherit;font-size:12px;line-height:16px}.cPOj3W_link:not(:disabled):hover{color:var(--dsw-alias-label-primary)}.cPOj3W_link[data-danger]{color:var(--dsw-alias-state-warn-label)}.cPOj3W_iconButton{width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;font-family:inherit;font-size:16px;line-height:1;display:inline-flex}.cPOj3W_iconButton:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.cPOj3W_iconButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.cPOj3W_note{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:16px}.cPOj3W_busy{color:var(--dsw-alias-label-tertiary);flex:none;padding:0 14px 10px;font-size:12px;line-height:16px}";
		const tagId$2 = "dsh-plugin-yon-panel/ProjectManager.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ProjectManager_module_css_default = {
			"body": "cPOj3W_body",
			"header": "cPOj3W_header",
			"error": "cPOj3W_error",
			"projectCode": "cPOj3W_projectCode",
			"projectMeta": "cPOj3W_projectMeta",
			"detailName": "cPOj3W_detailName",
			"title": "cPOj3W_title",
			"status": "cPOj3W_status",
			"primary": "cPOj3W_primary",
			"input": "cPOj3W_input",
			"sectionTitle": "cPOj3W_sectionTitle",
			"fieldRow": "cPOj3W_fieldRow",
			"projectRow": "cPOj3W_projectRow",
			"busy": "cPOj3W_busy",
			"projects": "cPOj3W_projects",
			"link": "cPOj3W_link",
			"detailHead": "cPOj3W_detailHead",
			"detailPane": "cPOj3W_detailPane",
			"fieldKey": "cPOj3W_fieldKey",
			"fields": "cPOj3W_fields",
			"iconButton": "cPOj3W_iconButton",
			"note": "cPOj3W_note",
			"addRow": "cPOj3W_addRow",
			"toggle": "cPOj3W_toggle",
			"listPane": "cPOj3W_listPane",
			"surface": "cPOj3W_surface",
			"projectName": "cPOj3W_projectName",
			"createRow": "cPOj3W_createRow"
		};
		//#endregion
		//#region src/client/project/ProjectManager.tsx
		/**
		* The project management surface: one floating panel with the project list, the
		* selected project's own columns, and an editable row per dynamic field.
		*
		* Components in this package hold no data access of their own: every call
		* arrives as a callback ({@link ProjectApi} methods projected through an inject
		* face), and what the panel shows is local render state.
		*/
		/**
		* Render a field value into its editable text.
		* @param value - stored value.
		* @returns text the operator can edit; objects and arrays stay JSON.
		*/
		function formatValue(value) {
			return typeof value === "string" ? value : JSON.stringify(value);
		}
		/**
		* Read edited text back into a value.
		* @param text - what the operator typed.
		* @returns the parsed JSON value, or the text itself when it is not JSON.
		*/
		function parseValue(text) {
			const trimmed = text.trim();
			if (trimmed === "") return "";
			try {
				return JSON.parse(trimmed);
			} catch {
				return text;
			}
		}
		/** Copy for one project status. */
		const STATUS_KEYS = {
			active: "project.status.active",
			paused: "project.status.paused",
			done: "project.status.done"
		};
		/** One editable field row: the name is the identity, the value is edited in place. */
		function FieldRow({ fieldKey, value, t, busy, onSave, onRemove }) {
			const [text, setText] = (0, react.useState)(() => formatValue(value));
			(0, react.useEffect)(() => {
				setText(formatValue(value));
			}, [value]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ProjectManager_module_css_default.fieldRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ProjectManager_module_css_default.fieldKey,
						title: fieldKey,
						children: fieldKey
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: ProjectManager_module_css_default.input,
						value: text,
						"aria-label": `${fieldKey} · ${t("project.fieldValue")}`,
						disabled: busy,
						onChange: (event) => {
							setText(event.target.value);
						},
						onBlur: () => {
							if (text !== formatValue(value)) onSave(fieldKey, parseValue(text));
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") event.currentTarget.blur();
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ProjectManager_module_css_default.iconButton,
						"aria-label": `${t("project.removeField")}: ${fieldKey}`,
						disabled: busy,
						onClick: () => {
							onRemove(fieldKey);
						},
						children: "×"
					})
				]
			});
		}
		/**
		* Render the surface.
		* @param props - injected API, copy seat, and close verb.
		* @returns the floating project panel.
		*/
		function ProjectManager({ t, onClose, ...api }) {
			const root = (0, react.useRef)(null);
			const [projects, setProjects] = (0, react.useState)([]);
			const [selected, setSelected] = (0, react.useState)();
			const [includeArchived, setIncludeArchived] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const [draftName, setDraftName] = (0, react.useState)("");
			const [draftCode, setDraftCode] = (0, react.useState)("");
			const [removing, setRemoving] = (0, react.useState)(false);
			const [newKey, setNewKey] = (0, react.useState)("");
			const [newValue, setNewValue] = (0, react.useState)("");
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(root, true, onClose);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [onClose]);
			/** Run one async action with the shared busy/error envelope. */
			const run = (0, react.useCallback)(async (action) => {
				setBusy(true);
				setError(void 0);
				try {
					await action();
				} catch (failure) {
					setError(failure instanceof Error ? failure.message : String(failure));
				} finally {
					setBusy(false);
				}
			}, []);
			/** Reload the list and keep a project selected. */
			const reload = (0, react.useCallback)((keepId, archived = includeArchived) => {
				run(async () => {
					const list = await api.listProjects(archived);
					setProjects(list);
					const target = keepId ?? list[0]?.projectId;
					setSelected(target === void 0 ? void 0 : await api.getProject(target));
				});
			}, [
				api,
				includeArchived,
				run
			]);
			(0, react.useEffect)(() => {
				reload(void 0, includeArchived);
			}, [includeArchived]);
			const select = (projectId) => {
				run(async () => {
					setSelected(await api.getProject(projectId));
				});
			};
			const create = () => {
				const name = draftName.trim();
				if (name === "") return;
				run(async () => {
					const created = await api.createProject({
						name,
						code: draftCode.trim()
					});
					setDraftName("");
					setDraftCode("");
					const list = await api.listProjects(includeArchived);
					setProjects(list);
					setSelected(created);
				});
			};
			const writeField = (projectId, fieldKey, value) => {
				run(async () => {
					setSelected(await api.setField(projectId, fieldKey, value));
				});
			};
			const dropField = (projectId, fieldKey) => {
				run(async () => {
					setSelected(await api.removeField(projectId, fieldKey));
				});
			};
			const addField = () => {
				const key = newKey.trim();
				if (key === "" || selected === void 0) return;
				run(async () => {
					setSelected(await api.setField(selected.projectId, key, parseValue(newValue)));
					setNewKey("");
					setNewValue("");
				});
			};
			const setArchived = (projectId, archived) => {
				run(async () => {
					await api.archiveProject(projectId, archived);
					const list = await api.listProjects(includeArchived);
					setProjects(list);
					setSelected(void 0);
					setRemoving(false);
				});
			};
			const removeProject = (projectId) => {
				run(async () => {
					await api.removeProject(projectId);
					setRemoving(false);
					const list = await api.listProjects(includeArchived);
					setProjects(list);
					setSelected(list[0] === void 0 ? void 0 : await api.getProject(list[0].projectId));
				});
			};
			const fields = Object.entries(selected?.fields ?? {});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: root,
				className: ProjectManager_module_css_default.surface,
				role: "dialog",
				"aria-label": t("item.project"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: ProjectManager_module_css_default.header,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ProjectManager_module_css_default.title,
								children: t("item.project")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: ProjectManager_module_css_default.toggle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: includeArchived,
									disabled: busy,
									onChange: (event) => {
										setIncludeArchived(event.target.checked);
									}
								}), t("project.showArchived")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ProjectManager_module_css_default.iconButton,
								"aria-label": t("panel.close"),
								onClick: onClose,
								children: "×"
							})
						]
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ProjectManager_module_css_default.error,
						role: "alert",
						children: t("project.failed", { message: error })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ProjectManager_module_css_default.body,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: ProjectManager_module_css_default.listPane,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ProjectManager_module_css_default.createRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: ProjectManager_module_css_default.input,
										placeholder: t("project.name"),
										"aria-label": t("project.name"),
										value: draftName,
										disabled: busy,
										onChange: (event) => {
											setDraftName(event.target.value);
										},
										onKeyDown: (event) => {
											if (event.key === "Enter") create();
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: ProjectManager_module_css_default.input,
										placeholder: t("project.code"),
										"aria-label": t("project.code"),
										value: draftCode,
										disabled: busy,
										onChange: (event) => {
											setDraftCode(event.target.value);
										},
										onKeyDown: (event) => {
											if (event.key === "Enter") create();
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ProjectManager_module_css_default.primary,
										disabled: busy || draftName.trim() === "",
										onClick: create,
										children: t("project.new")
									})
								]
							}), projects.length === 0 && error === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: ProjectManager_module_css_default.note,
								children: t("project.empty")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: ProjectManager_module_css_default.projects,
								children: projects.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: ProjectManager_module_css_default.projectRow,
									"data-project": project.projectId,
									"data-selected": project.projectId === selected?.projectId ? "" : void 0,
									"data-archived": project.archived ? "" : void 0,
									onClick: () => {
										select(project.projectId);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProjectManager_module_css_default.projectName,
											children: project.name
										}),
										project.code !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProjectManager_module_css_default.projectCode,
											children: project.code
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProjectManager_module_css_default.projectMeta,
											children: t("project.fieldCount", { count: project.fieldCount })
										})
									]
								}) }, project.projectId))
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
							className: ProjectManager_module_css_default.detailPane,
							children: selected === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: ProjectManager_module_css_default.note,
								children: t("project.pickHint")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: ProjectManager_module_css_default.detailHead,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
											className: ProjectManager_module_css_default.detailName,
											children: selected.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProjectManager_module_css_default.status,
											children: t(STATUS_KEYS[selected.status])
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: ProjectManager_module_css_default.link,
											disabled: busy,
											onClick: () => {
												setArchived(selected.projectId, !selected.archived);
											},
											children: selected.archived ? t("project.restore") : t("project.archive")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: ProjectManager_module_css_default.link,
											"data-danger": removing ? "" : void 0,
											disabled: busy,
											onClick: () => {
												if (removing) removeProject(selected.projectId);
												else setRemoving(true);
											},
											children: removing ? `${t("project.remove")}?` : t("project.remove")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: ProjectManager_module_css_default.sectionTitle,
									children: t("project.fields")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: ProjectManager_module_css_default.fields,
									children: fields.map(([fieldKey, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldRow, {
										fieldKey,
										value,
										t,
										busy,
										onSave: (key, next) => {
											writeField(selected.projectId, key, next);
										},
										onRemove: (key) => {
											dropField(selected.projectId, key);
										}
									}, fieldKey))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: ProjectManager_module_css_default.addRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: ProjectManager_module_css_default.input,
											placeholder: t("project.fieldKey"),
											"aria-label": t("project.fieldKey"),
											value: newKey,
											disabled: busy,
											onChange: (event) => {
												setNewKey(event.target.value);
											},
											onKeyDown: (event) => {
												if (event.key === "Enter") addField();
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: ProjectManager_module_css_default.input,
											placeholder: t("project.fieldValue"),
											"aria-label": t("project.fieldValue"),
											value: newValue,
											disabled: busy,
											onChange: (event) => {
												setNewValue(event.target.value);
											},
											onKeyDown: (event) => {
												if (event.key === "Enter") addField();
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: ProjectManager_module_css_default.primary,
											disabled: busy || newKey.trim() === "",
											onClick: addField,
											children: t("project.addField")
										})
									]
								})
							] })
						})]
					}),
					busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ProjectManager_module_css_default.busy,
						children: t("project.saving")
					})
				]
			});
		}
		//#endregion
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\ProjectItem.module.css.mjs
		const css$1 = ".OkOh1a_item{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:8px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.OkOh1a_item:hover,.OkOh1a_item[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.OkOh1a_item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}";
		const tagId$1 = "dsh-plugin-yon-panel/ProjectItem.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ProjectItem_module_css_default = { "item": "OkOh1a_item" };
		//#endregion
		//#region src/client/ProjectItem.tsx
		/**
		* The panel's built-in entry: one icon cell that opens the project surface.
		*
		* The surface is a fixed-position overlay rather than a region of the panel body
		* — a 280px strip cannot hold a list plus an editable field table — and this
		* entry owns it, so opening it needs no cross-seat coordination.
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
		* @returns the cell, plus the overlay when it is showing.
		*/
		function ProjectItem({ t, ...api }) {
			const [open, setOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("item.project"),
				side: "bottom",
				delayMs: 300,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: ProjectItem_module_css_default.item,
					"data-active": open ? "" : void 0,
					"aria-label": t("item.project"),
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderMark, {})
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
		//#region \0yon-css:E:\gitproject\dsh-plugin-yon-panel\src\client\YonPanelRoot.module.css.mjs
		const css = ".Ua_2rq_action{align-items:center;display:flex}.Ua_2rq_trigger{cursor:pointer;background:0 0;border:0;border-radius:8px;justify-content:center;align-items:center;width:32px;height:32px;padding:0;display:inline-flex}.Ua_2rq_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.Ua_2rq_trigger[data-active]{background:var(--dsw-alias-interactive-bg-active)}.Ua_2rq_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Ua_2rq_mark{border:.5px solid var(--dsw-alias-label-primary);width:24px;height:24px;color:var(--dsw-alias-label-primary);box-sizing:border-box;user-select:none;border-radius:7px;justify-content:center;align-items:center;font-size:12px;font-weight:700;line-height:1;display:inline-flex}.Ua_2rq_panel{z-index:30;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:280px;max-height:min(60vh,480px);box-shadow:var(--dsw-elevation-panel);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;border-radius:12px;flex-direction:column;display:flex;position:fixed;overflow:hidden}.Ua_2rq_header{box-sizing:border-box;flex:none;justify-content:space-between;align-items:center;min-height:40px;padding:8px 10px 8px 12px;display:flex}.Ua_2rq_title{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px}.Ua_2rq_close{width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;font-family:inherit;font-size:16px;line-height:1;display:inline-flex}.Ua_2rq_close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.Ua_2rq_close:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.Ua_2rq_body{flex-wrap:wrap;flex:1;align-content:flex-start;gap:4px;min-height:0;padding:8px;display:flex;overflow-y:auto}";
		const tagId = "dsh-plugin-yon-panel/YonPanelRoot.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-yon-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var YonPanelRoot_module_css_default = {
			"panel": "Ua_2rq_panel",
			"trigger": "Ua_2rq_trigger",
			"mark": "Ua_2rq_mark",
			"action": "Ua_2rq_action",
			"header": "Ua_2rq_header",
			"close": "Ua_2rq_close",
			"body": "Ua_2rq_body",
			"title": "Ua_2rq_title"
		};
		//#endregion
		//#region src/client/YonPanelRoot.tsx
		/** The yon_btn sidebar-foot action and the panel it opens above itself. */
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
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(root, open, onSetOpen);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") onSetOpen(false);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [open, onSetOpen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: root,
				className: YonPanelRoot_module_css_default.action,
				children: [open && anchor !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					ref: panel,
					className: YonPanelRoot_module_css_default.panel,
					style: anchor,
					role: "dialog",
					"aria-label": t("panel.title"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: YonPanelRoot_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: YonPanelRoot_module_css_default.title,
							children: t("panel.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: YonPanelRoot_module_css_default.close,
							"aria-label": t("panel.close"),
							onClick: () => {
								onSetOpen(false);
							},
							children: "×"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: YonPanelRoot_module_css_default.body,
						children: renderSlot("yon.panel.item", { open })
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("panel.title"),
					side: "right",
					delayMs: 400,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: YonPanelRoot_module_css_default.trigger,
						"data-active": open ? "" : void 0,
						"aria-expanded": open,
						"aria-label": t("trigger.label"),
						onClick: onToggle,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(YonMark, {})
					})
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `yonPanel` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"trigger.label": "yon_btn",
			"panel.title": "yon 按钮面板",
			"panel.close": "关闭面板",
			"item.project": "项目管理面板",
			"project.new": "新建项目",
			"project.name": "名称",
			"project.code": "编码",
			"project.status": "状态",
			"project.status.active": "进行中",
			"project.status.paused": "已暂停",
			"project.status.done": "已完成",
			"project.fields": "字段",
			"project.fieldKey": "字段名",
			"project.fieldValue": "值",
			"project.addField": "新增字段",
			"project.removeField": "删除该字段",
			"project.archive": "归档",
			"project.restore": "恢复",
			"project.remove": "彻底删除",
			"project.showArchived": "显示已归档",
			"project.empty": "还没有项目，先建一个",
			"project.pickHint": "选一个项目，就能增删它的字段",
			"project.fieldCount": "{count} 个字段",
			"project.saving": "保存中…",
			"project.failed": "操作失败：{message}"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"trigger.label": "yon_btn",
			"panel.title": "yon button panel",
			"panel.close": "Close panel",
			"item.project": "Project management panel",
			"project.new": "New project",
			"project.name": "Name",
			"project.code": "Code",
			"project.status": "Status",
			"project.status.active": "Active",
			"project.status.paused": "Paused",
			"project.status.done": "Done",
			"project.fields": "Fields",
			"project.fieldKey": "Field",
			"project.fieldValue": "Value",
			"project.addField": "Add field",
			"project.removeField": "Remove this field",
			"project.archive": "Archive",
			"project.restore": "Restore",
			"project.remove": "Delete permanently",
			"project.showArchived": "Show archived",
			"project.empty": "No projects yet — create one",
			"project.pickHint": "Pick a project to add or remove its fields",
			"project.fieldCount": "{count} fields",
			"project.saving": "Saving…",
			"project.failed": "Failed: {message}"
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
				inject: () => ({ ...projectApi })
			}, ProjectItem));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map