export interface RoutingNode {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  type?: string;
}

export interface RoutingConnection {
  from_id: string;
  to_id: string;
  branch?: string;
}

export interface ConnectionRoute {
  path: string;
  bounds?: { left: number; top: number; right: number; bottom: number };
  points?: { x: number; y: number }[];
  sourceSide?: string;
  targetSide?: string;
  sourcePort?: Point;
  targetPort?: Point;
  status: 'ok' | 'blocked' | 'invalid';
  warning?: string;
  bridges: Point[];
  bridgePaths: string[];
  /** Center of a 20 x 20 delete control, in graph coordinates. */
  labelX: number;
  labelY: number;
}

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type Card = RoutingNode & { width: number; height: number; rect: Rect };
type Segment = { a: Point; b: Point };
type Port = { point: Point; normal: Point };

export function swapBranchPorts(sourceX: number, trueTargetX?: number, falseTargetX?: number): boolean {
  if (trueTargetX !== undefined && falseTargetX !== undefined) return trueTargetX > falseTargetX;
  if (trueTargetX !== undefined) return trueTargetX > sourceX + 120;
  if (falseTargetX !== undefined) return falseTargetX < sourceX + 60;
  return false;
}

const PADDING = 12;
const ARROW = 24;
const LANE = 12;
const EPS = 0.000001;

/** Includes the index so even duplicate edges have distinct, reproducible keys. */
export function connectionKey(conn: RoutingConnection, index: number): string {
  return JSON.stringify([conn.from_id, conn.to_id, conn.branch || 'default', index]);
}

const equal = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const offset = (p: Point, n: Point, amount: number): Point => ({
  x: p.x + n.x * amount, y: p.y + n.y * amount,
});
const inside = (p: Point, r: Rect): boolean =>
  p.x > r.left + EPS && p.x < r.right - EPS && p.y > r.top + EPS && p.y < r.bottom - EPS;

function intersects(a: Point, b: Point, r: Rect): boolean {
  if (a.x === b.x) {
    return a.x > r.left + EPS && a.x < r.right - EPS &&
      Math.max(a.y, b.y) > r.top + EPS && Math.min(a.y, b.y) < r.bottom - EPS;
  }
  return a.y > r.top + EPS && a.y < r.bottom - EPS &&
    Math.max(a.x, b.x) > r.left + EPS && Math.min(a.x, b.x) < r.right - EPS;
}

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    if (result.length && equal(result[result.length - 1], p)) continue;
    while (result.length >= 2) {
      const a = result[result.length - 2];
      const b = result[result.length - 1];
      if (!((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) ||
          (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < 0) break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}

function bridgedPath(points: Point[], crossings: Point[]): { path: string; bridgePaths: string[] } {
  if (!points.length) return { path: '', bridgePaths: [] };
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  const bridgePaths: string[] = [];
  const segHits = (a: Point, b: Point) => crossings
    .filter(p => a.y === b.y && Math.abs(p.y - a.y) < EPS && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x))
    .sort((p, q) => distance(a, p) - distance(a, q));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const hits = segHits(a, b);
    for (let j = 0; j < hits.length; j++) {
      const p = hits[j];
      const radius = Math.min(5, distance(a, p) / 2, distance(b, p) / 2,
        j ? distance(hits[j - 1], p) / 3 : 5, j + 1 < hits.length ? distance(hits[j + 1], p) / 3 : 5);
      const before = p.x - Math.sign(b.x - a.x) * radius;
      const after = p.x + Math.sign(b.x - a.x) * radius;
      const arc = ' Q ' + p.x + ' ' + (p.y - radius * 2) + ' ' + after + ' ' + p.y;
      path += ' L ' + before + ' ' + p.y + arc;
      bridgePaths.push('M ' + before + ' ' + p.y + arc);
    }
    if (i < points.length - 1) {
      const c = points[i + 1];
      const nextHits = segHits(b, c);
      const rEnd = Math.min(
        10,
        distance(a, b) / 3,
        distance(b, c) / 3,
        hits.length ? Math.max(0, distance(hits[hits.length - 1], b) - 6) : 10,
        nextHits.length ? Math.max(0, distance(b, nextHits[0]) - 6) : 10,
      );
      if (rEnd > 1) {
        const before = { x: b.x + Math.sign(a.x - b.x) * rEnd, y: b.y + Math.sign(a.y - b.y) * rEnd };
        const after = { x: b.x + Math.sign(c.x - b.x) * rEnd, y: b.y + Math.sign(c.y - b.y) * rEnd };
        path += ' L ' + before.x + ' ' + before.y + ' Q ' + b.x + ' ' + b.y + ' ' + after.x + ' ' + after.y;
        continue;
      }
    }
    path += ' L ' + b.x + ' ' + b.y;
  }
  return { path, bridgePaths };
}

function congestion(a: Point, b: Point, used: Segment[]): number {
  let cost = 0;
  const horizontal = a.y === b.y;
  for (const s of used) {
    const otherHorizontal = s.a.y === s.b.y;
    if (horizontal === otherHorizontal) {
      const separation = horizontal ? Math.abs(a.y - s.a.y) : Math.abs(a.x - s.a.x);
      if (separation >= LANE) continue;
      const overlap = horizontal
        ? Math.min(Math.max(a.x, b.x), Math.max(s.a.x, s.b.x)) - Math.max(Math.min(a.x, b.x), Math.min(s.a.x, s.b.x))
        : Math.min(Math.max(a.y, b.y), Math.max(s.a.y, s.b.y)) - Math.max(Math.min(a.y, b.y), Math.min(s.a.y, s.b.y));
      if (overlap > EPS && separation < EPS) return Infinity;
      if (overlap > EPS) cost += overlap * 4 + 120;
    } else {
      const h = horizontal ? { a, b } : s;
      const v = horizontal ? s : { a, b };
      if (v.a.x >= Math.min(h.a.x, h.b.x) && v.a.x <= Math.max(h.a.x, h.b.x) &&
          h.a.y >= Math.min(v.a.y, v.b.y) && h.a.y <= Math.max(v.a.y, v.b.y)) cost += 160;
    }
  }
  return cost;
}

class MinHeap {
  private items: { state: number; cost: number; priority: number; order: number }[] = [];
  private sequence = 0;
  push(state: number, cost: number, priority: number): void {
    const item = { state, cost, priority, order: this.sequence++ };
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(item, this.items[parent])) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = item;
  }
  private less(a: { priority: number; order: number }, b: { priority: number; order: number }): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.order < b.order);
  }
  pop(): { state: number; cost: number } | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!last || !this.items.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.items.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.items.length && this.less(this.items[child + 1], this.items[child])) child++;
      if (!this.less(this.items[child], last)) break;
      this.items[i] = this.items[child];
      i = child;
    }
    this.items[i] = last;
    return first;
  }
}

function search(start: Point, end: Point, baseX: number[], baseY: number[], obstacles: Rect[], used: Segment[]): Point[] | undefined {
  const xs = [...new Set([...baseX, start.x, end.x])].sort((a, b) => a - b);
  const ys = [...new Set([...baseY, start.y, end.y])].sort((a, b) => a - b);
  const width = xs.length;
  const count = width * ys.length;
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const endIndex = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const scores = new Float64Array(count * 2).fill(Infinity);
  const parents = new Int32Array(count * 2).fill(-1);
  const blocked = new Int8Array(count);
  const costs = new Map<number, number>();
  const heap = new MinHeap();
  const point = (index: number): Point => ({ x: xs[index % width], y: ys[Math.floor(index / width)] });
  const available = (index: number): boolean => {
    if (!blocked[index]) blocked[index] = obstacles.some(r => inside(point(index), r)) ? -1 : 1;
    return blocked[index] > 0;
  };
  if (!available(startIndex) || !available(endIndex)) return undefined;
  for (let direction = 0; direction < 2; direction++) {
    scores[startIndex * 2 + direction] = 0;
    heap.push(startIndex * 2 + direction, 0, distance(start, end));
  }
  for (let current = heap.pop(); current; current = heap.pop()) {
    if (current.cost !== scores[current.state]) continue;
    const index = Math.floor(current.state / 2);
    const direction = current.state % 2;
    if (index === endIndex) {
      const points: Point[] = [];
      for (let state = current.state; state !== -1; state = parents[state]) points.push(point(Math.floor(state / 2)));
      return simplify(points.reverse());
    }
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [x + 1 < width ? index + 1 : -1, y + 1 < ys.length ? index + width : -1,
      x > 0 ? index - 1 : -1, y > 0 ? index - width : -1];
    const a = point(index);
    for (let d = 0; d < neighbors.length; d++) {
      const next = neighbors[d];
      if (next < 0 || !available(next)) continue;
      // Adjacent grid edges use a compact undirected key; costs are local to this search.
      const key = Math.min(index, next) * 2 + (d % 2);
      let travel = costs.get(key);
      const b = point(next);
      if (travel === undefined) {
        const touchesCorner = used.some(s => [s.a, s.b].some(p => !equal(p, start) && !equal(p, end) &&
          (a.x === b.x ? Math.abs(p.x - a.x) < EPS && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
            : Math.abs(p.y - a.y) < EPS && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x))));
        travel = touchesCorner || obstacles.some(r => intersects(a, b, r)) ? Infinity : distance(a, b) + congestion(a, b, used);
        costs.set(key, travel);
      }
      const nextDirection = d % 2;
      // A crossing must pass straight through: a turn on another wire looks like a junction.
      if (nextDirection !== direction && index !== startIndex && used.some(s =>
        s.a.x === s.b.x ? Math.abs(a.x - s.a.x) < EPS && a.y >= Math.min(s.a.y, s.b.y) && a.y <= Math.max(s.a.y, s.b.y)
          : Math.abs(a.y - s.a.y) < EPS && a.x >= Math.min(s.a.x, s.b.x) && a.x <= Math.max(s.a.x, s.b.x))) continue;
      const score = current.cost + travel + (nextDirection === direction ? 0 : 180);
      const state = next * 2 + nextDirection;
      if (score >= scores[state]) continue;
      scores[state] = score;
      parents[state] = current.state;
      heap.push(state, score, score + distance(b, end));
    }
  }
  return undefined;
}

function port(card: Card, side: 'top' | 'bottom' | 'left' | 'right', branchX?: number): Port {
  if (side === 'top') return { point: { x: card.x + (branchX ?? card.width / 2), y: card.y }, normal: { x: 0, y: -1 } };
  if (side === 'bottom') return { point: { x: card.x + (branchX ?? card.width / 2), y: card.y + card.height }, normal: { x: 0, y: 1 } };
  if (side === 'left') return { point: { x: card.x, y: card.y + (branchX ?? card.height / 2) }, normal: { x: -1, y: 0 } };
  return { point: { x: card.x + card.width, y: card.y + (branchX ?? card.height / 2) }, normal: { x: 1, y: 0 } };
}

function chooseLabel(points: Point[], cards: Card[], used: Segment[], labels: Rect[], fallback: Point): Point {
  const candidates: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (distance(a, b) < 24) continue;
    for (const fraction of [0.5, 0.25, 0.75]) {
      const center = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      for (const delta of [18, -18, 30, -30]) candidates.push(a.y === b.y
        ? { x: center.x, y: center.y + delta } : { x: center.x + delta, y: center.y });
    }
  }
  // A disconnected or crowded edge still gets an unobstructed delete control on an outside rail.
  for (let i = 0; i <= labels.length + used.length + 1; i++) candidates.push({ x: fallback.x + i * 28, y: fallback.y });
  for (const p of candidates) {
    const rect = { left: p.x - 12, right: p.x + 12, top: p.y - 12, bottom: p.y + 12 };
    if (cards.some(c => rect.left < c.rect.right && rect.right > c.rect.left && rect.top < c.rect.bottom && rect.bottom > c.rect.top) ||
        labels.some(r => rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top) ||
        used.some(s => intersects(s.a, s.b, rect))) continue;
    labels.push(rect);
    return p;
  }
  // Finite routes/labels occupy finitely many coordinates; this location lies beyond all of them.
  const p = { x: Math.max(fallback.x, ...labels.map(r => r.right), ...used.flatMap(s => [s.a.x, s.b.x])) + 28, y: fallback.y };
  labels.push({ left: p.x - 12, right: p.x + 12, top: p.y - 12, bottom: p.y + 12 });
  return p;
}

/** Reserve every endpoint before routing, including future edges' terminal stubs. */
export function routeConnections(nodes: RoutingNode[], connections: RoutingConnection[]): Map<string, ConnectionRoute> {
  const result = new Map<string, ConnectionRoute>();
  const cards: Card[] = nodes.filter(n => Number.isFinite(n.x) && Number.isFinite(n.y)).map(n => {
    const width = Number.isFinite(n.width) && n.width! > 0 ? n.width! : 244;
    const height = Number.isFinite(n.height) && n.height! > 0 ? n.height! : 172;
    return { ...n, width, height, rect: { left: n.x - PADDING, right: n.x + width + PADDING,
      top: n.y - PADDING, bottom: n.y + height + PADDING } };
  });
  const byId = new Map(cards.map(c => [c.id, c]));
  const obstacles = cards.map(c => c.rect);
  const left = Math.min(0, ...obstacles.map(r => r.left)) - 48;
  const right = Math.max(0, ...obstacles.map(r => r.right)) + 48;
  const top = Math.min(0, ...obstacles.map(r => r.top)) - 48;
  const bottom = Math.max(0, ...obstacles.map(r => r.bottom)) + 48;
  type Side = 'top' | 'bottom' | 'left' | 'right';
  type Endpoint = { card: Card; side: Side; anchor?: number; port?: Port; peer?: Endpoint };
  const endpoints: Endpoint[] = [];
  const edges = connections.map((conn, index) => {
    const source = byId.get(conn.from_id), target = byId.get(conn.to_id);
    if (!source || !target) return { key: connectionKey(conn, index) };
    const above = target.y <= source.y - 120;
    const below = target.y >= source.y + 120;
    const sameRowRight = target.x >= source.x + 100 && Math.abs(target.y - source.y) < 120;
    const self = source.id === target.id;
    const conditional = source.type === 'if_template' || source.type === 'run_scenario';
    const sourceSide: Side = conditional ? 'bottom' : self || above || sameRowRight ? 'right' : 'bottom';
    const targetSide: Side = below ? 'top' : target.x >= source.x + 100 && !self ? 'left' : 'right';
    const group = connections.filter(c => c.from_id === source.id);
    const swap = swapBranchPorts(source.x,
      byId.get(group.find(c => c.branch === 'true')?.to_id || '')?.x,
      byId.get(group.find(c => c.branch === 'false')?.to_id || '')?.x);
    const branchX = conn.branch === 'true' ? (swap ? 180 : 60) : (swap ? 60 : 180);
    const out: Endpoint = { card: source, side: sourceSide,
      anchor: conditional ? source.width * branchX / 244 : sourceSide === 'bottom' ? source.width / 2 : source.height / 2 };
    const into: Endpoint = { card: target, side: targetSide, peer: out };
    out.peer = into;
    endpoints.push(out, into);
    return { key: connectionKey(conn, index), out, into };
  });
  const groups = new Map<string, Endpoint[]>();
  const occupiedByGroup = new Map<string, number[]>();
  for (const endpoint of endpoints) {
    const key = endpoint.card.id + ':' + endpoint.side;
    groups.set(key, [...(groups.get(key) || []), endpoint]);
  }
  for (const [key, group] of groups.entries()) {
    const first = group[0];
    const length = first.side === 'top' || first.side === 'bottom' ? first.card.width : first.card.height;
    const occupied: number[] = [];
    const outputs = group.filter(e => e.anchor !== undefined);
    for (const endpoint of outputs) {
      const siblings = outputs.filter(e => e.anchor === endpoint.anchor);
      const spacing = Math.min(LANE, length / (group.length + 2));
      const position = endpoint.anchor! + (siblings.indexOf(endpoint) - (siblings.length - 1) / 2) * spacing;
      endpoint.port = port(endpoint.card, endpoint.side, position);
      occupied.push(position);
    }
    occupiedByGroup.set(key, occupied);
  }
  for (const [key, group] of groups.entries()) {
    const first = group[0];
    const length = first.side === 'top' || first.side === 'bottom' ? first.card.width : first.card.height;
    const occupied = occupiedByGroup.get(key)!;
    const inputs = group.filter(e => e.anchor === undefined).sort((a, b) => {
      const pa = a.peer?.port?.point, pb = b.peer?.port?.point;
      if (!pa || !pb) return 0;
      return first.side === 'top' || first.side === 'bottom'
        ? (pa.x - pb.x) || (pa.y - pb.y)
        : (pa.y - pb.y) || (pa.x - pb.x);
    });
    for (const [index, endpoint] of inputs.entries()) {
      const ideal = length * (index + 1) / (inputs.length + 1);
      const candidates = [ideal, ...Array.from({ length: group.length * 4 + 1 }, (_, i) => length * (i + 1) / (group.length * 4 + 2))];
      candidates.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
      const separation = Math.min(LANE, length / (group.length * 4 + 2));
      const position = candidates.find(p => occupied.every(q => Math.abs(p - q) >= separation - EPS))!;
      endpoint.port = port(endpoint.card, endpoint.side, position);
      occupied.push(position);
    }
  }
  const stubs = endpoints.map(e => ({ a: e.port!.point, b: offset(e.port!.point, e.port!.normal, ARROW) }));
  const baseX = [left, right, ...obstacles.flatMap(r => [r.left, r.right]), ...stubs.flatMap(s => [s.b.x - LANE, s.b.x, s.b.x + LANE])];
  const baseY = [top, bottom, ...obstacles.flatMap(r => [r.top, r.bottom]), ...stubs.flatMap(s => [s.b.y - LANE, s.b.y, s.b.y + LANE])];
  const used: Segment[] = [];
  const labels: Rect[] = [];
  const completed = edges.map(edge => {
    const { out, into } = edge;
    let points: Point[] = [];
    let warning: string | undefined;
    if (out && into) {
      const source = out.port!, target = into.port!;
      const prefix = stubs[endpoints.indexOf(out)], suffix = stubs[endpoints.indexOf(into)];
      const reserved = [...used, ...stubs.filter(s => s !== prefix && s !== suffix)];
      const clearStub = (s: Segment, owner: Card) => cards.every(c => c.id === owner.id || !intersects(s.a, s.b, c.rect)) &&
        Number.isFinite(congestion(s.a, s.b, reserved));
      if (clearStub(prefix, out.card) && clearStub(suffix, into.card)) {
        const x = [...baseX], y = [...baseY];
        for (const s of used) {
          if (s.a.x === s.b.x) x.push(s.a.x - LANE, s.a.x + LANE);
          else y.push(s.a.y - LANE, s.a.y + LANE);
        }
        // The same hard constraint applies to fast paths, A*, and both terminal stubs.
        const allReserved = [...reserved, prefix, suffix];
        const candidates = [
          [prefix.b, { x: prefix.b.x, y: suffix.b.y }, suffix.b],
          [prefix.b, { x: suffix.b.x, y: prefix.b.y }, suffix.b],
        ].map(simplify).filter(path => path.every((p, i) => !i ||
          (!obstacles.some(r => intersects(path[i - 1], p, r)) && congestion(path[i - 1], p, allReserved) === 0)));
        const middle = candidates[0] || search(prefix.b, suffix.b, x, y, obstacles, allReserved);
        if (middle) points = simplify([source.point, ...middle, target.point]);
      }
      if (!points.length) warning = 'Cannot route this connection: move overlapping cards apart or use Auto Layout.';
    } else warning = 'Connection endpoint is missing or has invalid coordinates.';
    for (let i = 1; i < points.length; i++) used.push({ a: points[i - 1], b: points[i] });
    return { ...edge, points, warning };
  });
  for (const edge of completed) {
    const { key, points, out, into, warning } = edge;
    const crossings: Point[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (a.y !== b.y) continue;
      for (const other of completed) {
        if (other === edge) continue;
        for (let j = 1; j < other.points.length; j++) {
          const c = other.points[j - 1], d = other.points[j];
          if (c.x === d.x && c.x > Math.min(a.x, b.x) + EPS && c.x < Math.max(a.x, b.x) - EPS &&
              a.y > Math.min(c.y, d.y) + EPS && a.y < Math.max(c.y, d.y) - EPS &&
              !crossings.some(p => p.x === c.x && p.y === a.y)) crossings.push({ x: c.x, y: a.y });
        }
      }
    }
    const label = chooseLabel(points, cards, used, labels, { x: right + 32, y: top - 32 });
    const xs = [...points.map(p => p.x), label.x - 16, label.x + 16];
    const ys = [...points.map(p => p.y), label.y - 16, label.y + 16];
    result.set(key, { ...bridgedPath(points, crossings), points, bridges: crossings,
      status: warning ? out ? 'blocked' : 'invalid' : 'ok', warning,
      bounds: { left: Math.min(...xs) - 16, right: Math.max(...xs) + 16, top: Math.min(...ys) - 16, bottom: Math.max(...ys) + 16 },
      sourceSide: out?.side, targetSide: into?.side, sourcePort: out?.port?.point, targetPort: into?.port?.point,
      labelX: label.x, labelY: label.y });
  }
  return result;
}
