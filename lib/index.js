//#region src/index.ts
/**
* yon_btn button panel, node half. Pure UI plugin: the empty apply exists so
* the package can be a Loader row; the browser half ships through
* exports["./client"], discovered via the package.json `dsh.client` declaration.
*/
/** Host plugin body — this surface plugin owns no host-side behavior. */
function apply() {}
//#endregion
export { apply };
