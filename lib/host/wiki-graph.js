/**
 * Derive the reference graph from a built index.
 *
 * @param index - the vault's index, with references already parsed per page.
 * @returns the graph, ready to answer relation and gap questions.
 */
export function buildGraph(index) {
    const byUri = new Map();
    for (const page of index.entities) {
        if (page.uri !== null && !byUri.has(page.uri))
            byUri.set(page.uri, page.page);
    }
    const out = new Map();
    const incoming = new Map();
    const missing = new Map();
    let resolvedEdges = 0;
    let danglingEdges = 0;
    for (const page of index.entities) {
        const refs = page.refs;
        if (refs === undefined || refs.length === 0)
            continue;
        out.set(page.page, refs);
        for (const ref of refs) {
            const target = byUri.get(ref.uri);
            if (target === undefined) {
                danglingEdges++;
                const entry = missing.get(ref.uri);
                if (entry === undefined)
                    missing.set(ref.uri, { cited: 1, citedBy: [page.page] });
                else {
                    entry.cited++;
                    if (entry.citedBy.length < 5)
                        entry.citedBy.push(page.page);
                }
                continue;
            }
            resolvedEdges++;
            const list = incoming.get(target);
            if (list === undefined)
                incoming.set(target, [{ from: page.page, kind: ref.kind }]);
            else
                list.push({ from: page.page, kind: ref.kind });
        }
    }
    return { out, incoming, byUri, missing, resolvedEdges, danglingEdges };
}
/**
 * Judge one page.
 *
 * The level comes from the two facts a SQL writer needs in order — the table and
 * the columns — and never from a weighted sum, so the same page gets the same
 * verdict whoever is asking.
 *
 * @param page - the page as the index holds it.
 * @param graph - the graph, for the page's reference counts.
 * @returns the level and what is missing.
 */
export function assessPage(page, graph) {
    const table = page.table;
    const fieldCount = page.fieldCount;
    const refs = graph.out.get(page.page)?.length ?? 0;
    const incoming = graph.incoming.get(page.page)?.length ?? 0;
    const level = table === undefined
        ? 'concept'
        : fieldCount === undefined || fieldCount === 0 ? 'locatable' : 'query-ready';
    const lacks = [];
    if (table === undefined) {
        lacks.push('没有物理表名，无法据此写 SQL；这是概念页，先找它落地的实体');
    }
    else if (level === 'locatable') {
        lacks.push(`有物理表 \`${table}\` 但页面没有字段清单，列名要用 datasource_query 查库确认`);
    }
    if (refs === 0 && incoming === 0) {
        lacks.push('这一页不与任何其他实体相连，既没引用别人也没被引用');
    }
    return {
        level,
        ...(table === undefined ? {} : { table }),
        ...(fieldCount === undefined ? {} : { fieldCount }),
        refs,
        incoming,
        lacks,
    };
}
/**
 * How many unresolved targets to name.
 *
 * A count and a sample rather than the whole list: a page that cites 300 entities
 * the vault has never heard of needs a number and an example, not 300 names.
 */
const UNRESOLVED_SAMPLE = 12;
/**
 * Collect one page's relations, both directions.
 *
 * Both directions matter and for different reasons: the outgoing edges are what
 * the model can read next without searching again, and the incoming edges answer
 * "what else is built on this entity" — which is the question a lookup cannot
 * answer at all, because it only ever searches by name.
 *
 * @param page - the page name.
 * @param graph - the graph to read.
 * @returns the relations, each side grouped by kind and sorted.
 */
export function relationsOf(page, graph) {
    const outgoing = new Map();
    const unresolved = [];
    for (const ref of graph.out.get(page) ?? []) {
        const list = outgoing.get(ref.kind);
        if (list === undefined)
            outgoing.set(ref.kind, [ref.uri]);
        else
            list.push(ref.uri);
        if (!graph.byUri.has(ref.uri))
            unresolved.push(ref.uri);
    }
    const incoming = new Map();
    for (const edge of graph.incoming.get(page) ?? []) {
        const list = incoming.get(edge.kind);
        if (list === undefined)
            incoming.set(edge.kind, [edge.from]);
        else
            list.push(edge.from);
    }
    for (const list of outgoing.values())
        list.sort((a, b) => a.localeCompare(b, 'zh'));
    for (const list of incoming.values())
        list.sort((a, b) => a.localeCompare(b, 'zh'));
    return {
        outgoing,
        incoming,
        unresolved: { total: unresolved.length, sample: unresolved.slice(0, UNRESOLVED_SAMPLE) },
    };
}
/**
 * The vault's largest holes: entities the pages keep naming and no page covers.
 *
 * @param graph - the graph to read.
 * @param limit - how many to return.
 * @returns the holes, most-cited first.
 */
export function gapsOf(graph, limit) {
    return [...graph.missing]
        .sort((a, b) => b[1].cited - a[1].cited || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([uri, entry]) => ({ uri, cited: entry.cited, citedBy: entry.citedBy }));
}
/**
 * Count what the graph holds.
 * @param index - the vault's index.
 * @param graph - its graph.
 * @returns the tallies a report quotes.
 */
export function summaryOf(index, graph) {
    let withOutgoing = 0;
    let withIncoming = 0;
    let isolated = 0;
    for (const page of index.entities) {
        const out = graph.out.has(page.page);
        const incoming = graph.incoming.has(page.page);
        if (out)
            withOutgoing++;
        if (incoming)
            withIncoming++;
        if (!out && !incoming)
            isolated++;
    }
    return {
        pages: index.entities.length,
        withOutgoing,
        withIncoming,
        isolated,
        resolvedEdges: graph.resolvedEdges,
        danglingEdges: graph.danglingEdges,
        missingEntities: graph.missing.size,
    };
}
