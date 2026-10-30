/** Viewport-aware graph placement. Back edges are excluded from forward ranks. */
export interface AutoLayoutStep {
  id: string;
  type?: string;
  node_x?: number;
  node_y?: number;
}
export interface AutoLayoutConnection { from_id: string; to_id: string; branch?: string }
export interface AutoLayoutOptions { startX?: number; startY?: number; colStep?: number; rowStep?: number; maxCols?: number }

export function computeOptimalLayout<T extends AutoLayoutStep>(steps: T[], connections: AutoLayoutConnection[], options: AutoLayoutOptions = {}): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const cols = Math.max(1, Math.floor(options.maxCols ?? 4));
  const dx = Math.max(320, options.colStep ?? 340);
  const dy = Math.max(280, options.rowStep ?? 300);
  const x0 = options.startX ?? 24, y0 = options.startY ?? 24;
  const ids = new Set(steps.map(s => s.id));
  const outgoing = new Map<string, AutoLayoutConnection[]>();
  for (const c of connections) if (ids.has(c.from_id) && ids.has(c.to_id)) outgoing.set(c.from_id, [...(outgoing.get(c.from_id) ?? []), c]);
  const visiting = new Set<string>(), visited = new Set<string>(), back = new Set<AutoLayoutConnection>();
  function visit(id: string) {
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (visiting.has(edge.to_id)) back.add(edge);
      else visit(edge.to_id);
    }
    visiting.delete(id); visited.add(id);
  }
  const incomingIds = new Set(connections.map(c => c.to_id));
  for (const step of [...steps.filter(s => !incomingIds.has(s.id)), ...steps]) visit(step.id);
  const forward = connections.filter(c => ids.has(c.from_id) && ids.has(c.to_id) && !back.has(c));
  const incoming = new Map<string, string[]>();
  for (const c of forward) incoming.set(c.to_id, [...(incoming.get(c.to_id) ?? []), c.from_id]);

  // Union direct branch children into one row, including shared merge children.
  const parent = new Map(steps.map(s => [s.id, s.id]));
  function find(id: string): string { const p = parent.get(id)!; if (p === id) return id; const root = find(p); parent.set(id, root); return root; }
  for (const step of steps) {
    const edges = forward.filter(c => c.from_id === step.id);
    const a = edges.find(c => c.branch === 'true'), b = edges.find(c => c.branch === 'false');
    if (a && b && a.to_id !== b.to_id && find(a.to_id) !== find(step.id) && find(b.to_id) !== find(step.id)) parent.set(find(b.to_id), find(a.to_id));
  }
  const groups = new Map<string, T[]>();
  for (const step of steps) { const group = find(step.id); groups.set(group, [...(groups.get(group) ?? []), step]); }
  const placed = new Set<string>();
  const cells = new Map<string, { col: number; row: number }>();
  const occupied = new Set<string>();
  const returnSources = new Set([...back].map(c => c.from_id));
  function free(row: number, col: number, count: number) { for (let i = 0; i < count; i++) if (occupied.has(row + ':' + (col+i))) return false; return true; }
  while (placed.size < groups.size) {
    const ready = [...groups.entries()].filter(([key, members]) => !placed.has(key) && members.every(s => (incoming.get(s.id) ?? []).every(p => find(p) === key || placed.has(find(p)))));
    // Conflicting sibling constraints in arbitrary graphs fall back to deterministic placement.
    const batch = ready.length ? ready : [...groups.entries()].filter(([key]) => !placed.has(key)).slice(0,1);
    for (const [key, members] of batch) {
      const deps = members.flatMap(s => (incoming.get(s.id) ?? []).filter(p => find(p) !== key)).map(id => cells.get(id)).filter((p): p is {col:number;row:number} => Boolean(p));
      let row = deps.length ? Math.max(...deps.map(p => p.row)) : 0;
      let col = deps.length ? Math.max(...deps.filter(p => p.row === row).map(p => p.col)) + 1 : 0;
      const branchChild = members.length > 1 || members.some(s => forward.some(c => c.to_id === s.id && (c.branch === 'true' || c.branch === 'false')));
      if (branchChild && deps.length) { row++; col = Math.max(0, Math.min(cols - members.length, Math.min(...deps.map(p => p.col)))); }
      if (members.length === 1 && returnSources.has(members[0].id)) col = Math.max(col, cols - 1);
      if (col + members.length > cols && members.length <= cols) { row++; col = 0; }
      while (!free(row, col, members.length)) { col++; if (col + members.length > Math.max(cols,members.length)) { row++; col=0; } }
      // Keep sibling order stable with loop-return children on the right.
      const ordered = [...members].sort((a,b) => Number(returnSources.has(a.id))-Number(returnSources.has(b.id)));
      ordered.forEach((s,i) => { cells.set(s.id,{col:col+i,row}); occupied.add(row+':'+(col+i)); });
      placed.add(key);
    }
  }
  for (const step of steps) { const p=cells.get(step.id)!; positions.set(step.id,{x:x0+p.col*dx,y:y0+p.row*dy}); }
  return positions;
}
