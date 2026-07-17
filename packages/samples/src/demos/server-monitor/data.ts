// Self-contained data for the Server Monitor demo: a fleet of infrastructure
// hosts whose metrics tick live. Deterministic (seeded) so every load renders the
// same fleet, and the visible rows echo the reference screenshots (SERVER-0000
// "Tokyo API Server 1", ...). No DataSource / DataModel - just plain objects the
// realtime loop mutates in place.

export type Status = "Online" | "Warning" | "Critical" | "Maintenance" | "Offline";

export const STATUSES: Status[] = ["Online", "Warning", "Critical", "Maintenance", "Offline"];

export const HISTORY_LEN = 34; // sparkline points per host

export interface Server {
  id: string;
  name: string;
  cpu: number; // %
  memory: number; // %
  disk: number; // %
  response: number; // ms
  status: Status;
  cpuHistory: number[];
  cpuVel: number; // momentum, so the CPU curve trends smoothly instead of zig-zagging
  frozen: boolean; // Maintenance / Offline hosts don't random-walk
}

const REGIONS = [
  "Tokyo",
  "Ireland",
  "Ohio",
  "Mumbai",
  "Singapore",
  "N. Virginia",
  "São Paulo",
  "Oregon",
  "N. California",
];

const ROLES = [
  "API Server",
  "Database",
  "Background Worker",
  "Cache Server",
  "Load Balancer",
  "ML Compute",
  "Web Server",
  "Storage Server",
];

// Deterministic PRNG (mulberry32) so the fleet is identical on every mount.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Status follows the live metrics for "healthy" hosts; Maintenance / Offline are
// sticky states assigned at generation and left frozen.
function deriveStatus(cpu: number, memory: number, response: number): Status {
  if (cpu >= 92 || response >= 520 || memory >= 97) return "Critical";
  if (cpu >= 68 || memory >= 82 || response >= 360) return "Warning";
  return "Online";
}

export function generateServers(count: number): Server[] {
  const rand = mulberry32(0x5eed42);
  const servers: Server[] = [];
  for (let i = 0; i < count; i++) {
    const region = REGIONS[Math.floor(rand() * REGIONS.length)];
    const role = ROLES[Math.floor(rand() * ROLES.length)];

    // A few sticky Maintenance / Offline hosts so the status filter has every value.
    const roll = rand();
    let frozen = false;
    let status: Status = "Online";
    let cpu = clamp(rand() * 96 + 2, 0, 100);
    let memory = clamp(rand() * 92 + 6, 0, 100);
    let disk = clamp(rand() * 70 + 20, 0, 100);
    let response = clamp(rand() * 560 + 30, 5, 900);

    if (roll < 0.05) {
      frozen = true;
      status = "Offline";
      cpu = 0;
      memory = 0;
      response = 0;
    } else if (roll < 0.11) {
      frozen = true;
      status = "Maintenance";
      cpu = clamp(rand() * 22 + 3, 0, 100);
      response = clamp(rand() * 90 + 20, 5, 900);
    } else {
      status = deriveStatus(cpu, memory, response);
    }

    // Fixed-length ring buffer, zero-padded. New CPU values are pushed onto the END
    // each tick (oldest shifted off the front), so the line always fills from the
    // right and scrolls right -> left. Frozen hosts get no line.
    const cpuHistory: number[] = frozen ? [] : new Array<number>(HISTORY_LEN).fill(0);

    servers.push({
      id: `SERVER-${String(i).padStart(4, "0")}`,
      name: `${region} ${role} ${i + 1}`,
      cpu,
      memory,
      disk,
      response,
      status,
      cpuHistory,
      cpuVel: 0,
      frozen,
    });
  }
  return servers;
}

// One realtime step: random-walk the live hosts, shift the sparkline ring buffer,
// and recompute status from the fresh metrics. Mutates in place.
export function tickServers(servers: Server[], rand: () => number): void {
  for (const s of servers) {
    if (s.frozen) continue;
    // Momentum-driven CPU: velocity carries over between ticks (with mean reversion
    // toward 50 and a soft bounce at the edges) so the sparkline trends in smooth
    // arcs instead of zig-zagging point to point.
    s.cpuVel = s.cpuVel * 0.74 + (rand() - 0.5) * 2.6 + (50 - s.cpu) * 0.012;
    const nextCpu = s.cpu + s.cpuVel;
    if (nextCpu <= 1 || nextCpu >= 100) s.cpuVel *= -0.5;
    s.cpu = clamp(nextCpu, 1, 100);
    s.memory = clamp(s.memory + (rand() - 0.5) * 7, 2, 100);
    s.disk = clamp(s.disk + (rand() - 0.5) * 1.6, 5, 99);
    s.response = clamp(s.response + (rand() - 0.5) * 55, 8, 900);
    s.cpuHistory.push(s.cpu);
    if (s.cpuHistory.length > HISTORY_LEN) s.cpuHistory.shift();
    s.status = deriveStatus(s.cpu, s.memory, s.response);
  }
}

// A live PRNG for ticks - separate stream from generation, still seeded so runs
// are reproducible across reloads.
export function createTickRandom(): () => number {
  return mulberry32(0xa11ce);
}
