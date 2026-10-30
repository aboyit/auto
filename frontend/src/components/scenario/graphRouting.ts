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
  sourceSide?: string;
  targetSide?: string;
  /** Center of a 20 x 20 delete control, in graph coordinates. */
  labelX: number;
  labelY: number;
}

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type Card = RoutingNode & { width: number; height: number; rect: Rect };
type Segment = { a: Point; b: Point };
type Port = { point: Point; normal: Point };

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

function roundedPath(points: Point[]): string {
  if (!points.length) return '';
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i=1;i<points.length-1;i++) {
    const a=points[i-1], b=points[i], c=points[i+1];
    const radius=Math.min(14,distance(a,b)/2,distance(b,c)/2);
    const before={x:b.x+Math.sign(a.x-b.x)*radius,y:b.y+Math.sign(a.y-b.y)*radius};
    const after={x:b.x+Math.sign(c.x-b.x)*radius,y:b.y+Math.sign(c.y-b.y)*radius};
    path += ' L '+before.x+' '+before.y+' Q '+b.x+' '+b.y+' '+after.x+' '+after.y;
  }
  const end=points[points.length-1];
  return path+' L '+end.x+' '+end.y;
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
      if (overlap > EPS) cost += overlap * (separation < EPS ? 80 : 4) + 120;
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
        travel = obstacles.some(r => intersects(a, b, r)) ? Infinity : distance(a, b) + congestion(a, b, used);
        costs.set(key, travel);
      }
      const nextDirection = d % 2;
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
  if (side === 'top') return { point: { x: card.x + card.width / 2, y: card.y }, normal: { x: 0, y: -1 } };
  if (side === 'bottom') return { point: { x: card.x + (branchX ?? card.width / 2), y: card.y + card.height }, normal: { x: 0, y: 1 } };
  if (side === 'left') return { point: { x: card.x, y: card.y + card.height / 2 }, normal: { x: -1, y: 0 } };
  return { point: { x: card.x + card.width, y: card.y + card.height / 2 }, normal: { x: 1, y: 0 } };
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

/**
 * Pure, deterministic routing in input connection order. Missing/invalid endpoints are omitted.
 * Overlapping cards can make a port inaccessible: an empty path is returned rather than a line
 * through a card. Callers may show a routing warning for that edge. Labels are center coordinates.
 * Dimensions default to 240 x 172; conditional ports scale to quarter/three-quarter width.
 */
export function routeConnections(nodes: RoutingNode[], connections: RoutingConnection[]): Map<string, ConnectionRoute> {
  const result = new Map<string, ConnectionRoute>();
  const cards: Card[] = nodes.filter(n => Number.isFinite(n.x) && Number.isFinite(n.y)).map(n => {
    const width = Number.isFinite(n.width) && n.width! > 0 ? n.width! : 240;
    const height = Number.isFinite(n.height) && n.height! > 0 ? n.height! : 172;
    return { ...n, width, height, rect: { left: n.x - PADDING, right: n.x + width + PADDING,
      top: n.y - PADDING, bottom: n.y + height + PADDING } };
  });
  if (!cards.length) return result;
  const byId = new Map(cards.map(c => [c.id, c]));
  const obstacles = cards.map(c => c.rect);
  const left = Math.min(...obstacles.map(r => r.left)) - 48;
  const right = Math.max(...obstacles.map(r => r.right)) + 48;
  const top = Math.min(...obstacles.map(r => r.top)) - 48;
  const bottom = Math.max(...obstacles.map(r => r.bottom)) + 48;
  const baseX = [left, right, ...obstacles.flatMap(r => [r.left, r.right])];
  const baseY = [top, bottom, ...obstacles.flatMap(r => [r.top, r.bottom])];
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, RoutingConnection[]>();
  for (const c of connections) {
    if (!byId.has(c.from_id) || !byId.has(c.to_id)) continue;
    incoming.set(c.to_id, (incoming.get(c.to_id) || 0) + 1);
    const group = outgoing.get(c.from_id) || [];
    group.push(c);
    outgoing.set(c.from_id, group);
  }
  const ranks = new Map<string, number>();
  const used: Segment[] = [];
  const labels: Rect[] = [];
  const completed: { key: string; points: Point[]; sourceSide: string; targetSide: string }[] = [];
  let upward = 0;
  connections.forEach((conn, index) => {
    const source = byId.get(conn.from_id);
    const target = byId.get(conn.to_id);
    if (!source || !target) return;
    const below = target.y >= source.y + 120;
    const above = target.y <= source.y - 120;
    const sameRowRight = target.x >= source.x + 100 && Math.abs(target.y - source.y) < 120;
    const self = source.id === target.id;
    const conditional = source.type === 'if_template' || source.type === 'run_scenario';
    let sourcePort: Port;
    if (conditional) {
      const group = outgoing.get(source.id) || [];
      const trueTarget = byId.get(group.find(c => c.branch === 'true')?.to_id || '');
      const falseTarget = byId.get(group.find(c => c.branch === 'false')?.to_id || '');
      const swap = trueTarget && falseTarget ? trueTarget.x > falseTarget.x
        : trueTarget ? trueTarget.x > source.x + source.width / 2
          : falseTarget ? falseTarget.x < source.x + source.width / 4 : false;
      // Match the rendered branch badges: true/false swap sides only when both targets are known.
      const branchX = conn.branch === 'true' ? (swap ? 180 : 60) : conn.branch === 'false' ? (swap ? 60 : 180) : 180;
      sourcePort = port(source, 'bottom', branchX);
    } else sourcePort = port(source, self || above || sameRowRight ? 'right' : 'bottom');
    const targetPort = port(target, below ? 'top' : sameRowRight && !self ? 'left' : 'right');
    const rank = ranks.get(target.id) || 0;
    ranks.set(target.id, rank + 1);
    const tangent = { x: -targetPort.normal.y, y: targetPort.normal.x };
    const spread = 0;
    const endStub = offset(targetPort.point, targetPort.normal, ARROW);
    const laneEnd = offset(endStub, tangent, spread);
    const entry = offset(laneEnd, targetPort.normal, LANE * (rank + 1));
    const startStub = offset(sourcePort.point, sourcePort.normal, ARROW + LANE * ((outgoing.get(source.id) || []).indexOf(conn)));
    const prefix = [sourcePort.point, startStub];
    const suffix = [entry, laneEnd, endStub, targetPort.point];
    const clear = (points: Point[], exemptId?: string): boolean => points.every((p, i) =>
      i === 0 || cards.every(c => c.id === exemptId || !intersects(points[i - 1], p, c.rect)));
    let points: Point[] = [];
    if (clear(prefix, source.id) && clear(suffix.slice(-2), target.id) && clear(suffix.slice(0, -1))) {
      const x = [...baseX];
      const y = [...baseY];
      // Parallel lanes next to existing wires make overlap avoidance possible without a pixel grid.
      for (const s of used) {
        if (s.a.x === s.b.x) x.push(s.a.x - LANE, s.a.x + LANE);
        else y.push(s.a.y - LANE, s.a.y + LANE);
      }
      let middle: Point[] | undefined;
      const direct = startStub.x === entry.x || startStub.y === entry.y;
      if (direct && clear([startStub, entry])) middle = [startStub, entry];
      if (!middle && (above || self)) {
        const rail = right + upward++ * LANE * 2;
        x.push(rail);
        const railStart = { x: rail, y: startStub.y };
        const railEnd = { x: rail, y: entry.y };
        // Reserve the entire outside rail rather than merely biasing one A* waypoint.
        const first = search(startStub, railStart, x, y, obstacles, used);
        const last = search(railEnd, entry, x, y, obstacles, used);
        if (first && last) middle = [...first, railEnd, ...last];
      } else if (!middle) {
        const candidates = [
          [startStub, { x: startStub.x, y: entry.y }, entry],
          [startStub, { x: entry.x, y: startStub.y }, entry],
          [startStub, { x: startStub.x, y: (startStub.y + entry.y) / 2 }, { x: entry.x, y: (startStub.y + entry.y) / 2 }, entry],
        ].map(simplify).filter(points => clear(points));
        candidates.sort((a,b) => {
          const cost = (points: Point[]) => points.slice(1).reduce((sum,p,i) => sum + distance(points[i],p) + congestion(points[i],p,used), points.length * 180);
          return cost(a)-cost(b);
        });
        middle = candidates[0] ?? search(startStub, entry, x, y, obstacles, used);
      }
      if (middle) points = simplify([...prefix, ...middle, ...suffix]);
    }
    for (let i = 1; i < points.length; i++) used.push({ a: points[i - 1], b: points[i] });
    completed.push({ key: connectionKey(conn, index), points, sourceSide: sourcePort.normal.y === 1 ? 'bottom' : sourcePort.normal.x === -1 ? 'left' : 'right', targetSide: targetPort.normal.y === -1 ? 'top' : targetPort.normal.x === -1 ? 'left' : 'right' });
  });
  // Place controls only after routing every edge, so later wires cannot cross earlier controls.
  for (const { key, points, sourceSide, targetSide } of completed) {
    const label = chooseLabel(points, cards, used, labels, { x: right + 32, y: top - 32 });
    result.set(key, { path: roundedPath(points), sourceSide, targetSide, labelX: label.x, labelY: label.y });
  }
  return result;
}
