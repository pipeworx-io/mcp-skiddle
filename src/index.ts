interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Skiddle MCP.
 *
 * UK events — club nights, live music, festivals, comedy, theatre, exhibitions —
 * from the Skiddle API (https://www.skiddle.com/api/). Search by location
 * (lat/long + radius), keyword, category and date window. Requires a free API
 * key: the gateway fronts a platform key (PLATFORM_SKIDDLE_KEY) and callers may
 * pass their own via `_apiKey`. Free key: https://www.skiddle.com/api/join.php
 */


const BASE = 'https://www.skiddle.com/api/v1';
const UA = 'pipeworx-mcp-skiddle/1.0 (+https://pipeworx.io)';

/** Skiddle event category codes (eventcode). */
const CATEGORIES: Record<string, string> = {
  FEST: 'Festivals',
  LIVE: 'Live music / gigs',
  CLUB: 'Clubbing / club nights',
  DATE: 'Date ideas',
  THEATRE: 'Theatre / shows',
  COMEDY: 'Comedy',
  EXHIB: 'Exhibitions & attractions',
  KIDS: 'Kids / family',
  BARPUB: 'Bar / pub events',
  LGB: 'LGBTQ+',
  ARTS: 'Arts',
  FILM: 'Film',
  SPORT: 'Sport',
  STAGE: 'Stage & screen',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'search_events',
    description:
      'Search UK events (gigs, club nights, festivals, comedy, theatre, exhibitions). Filter by location (latitude+longitude+radius), keyword, category, and date window. Sorted by date or distance.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Search-centre latitude (pair with longitude), e.g. 51.5074 for London.' },
        longitude: { type: 'number', description: 'Search-centre longitude (pair with latitude), e.g. -0.1278 for London.' },
        radius: { type: 'number', description: 'Search radius in miles (default 10, used with lat/long).' },
        keyword: { type: 'string', description: 'Keyword to match in event/venue/artist, e.g. "techno", "Adele".' },
        category: { type: 'string', description: 'Category code: FEST, LIVE, CLUB, COMEDY, THEATRE, EXHIB, KIDS, BARPUB, LGB, ARTS, FILM, SPORT, DATE. Use the categories tool.' },
        from: { type: 'string', description: 'Earliest event date YYYY-MM-DD (default: today).' },
        to: { type: 'string', description: 'Latest event date YYYY-MM-DD.' },
        order: { type: 'string', enum: ['date', 'distance', 'trending', 'alphabetical'], description: 'Result ordering (default "date"; "distance" needs lat/long).' },
        limit: { type: 'number', description: 'Max events (1-100, default 20).' },
        offset: { type: 'number', description: 'Pagination offset (default 0).' },
      },
    },
  },
  {
    name: 'event',
    description: 'Get a single Skiddle event by id, with full details and venue.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Skiddle event id.' } },
      required: ['id'],
    },
  },
  {
    name: 'categories',
    description: 'List Skiddle event category codes (for the search_events `category` filter).',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'categories') {
    return { categories: Object.entries(CATEGORIES).map(([code, label]) => ({ code, label })) };
  }
  const apiKey = keyOf(args);
  switch (name) {
    case 'search_events':
      return searchEvents(apiKey, args);
    case 'event':
      return getEvent(apiKey, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function searchEvents(apiKey: string, args: Record<string, unknown>): Promise<unknown> {
  const qs = new URLSearchParams({ api_key: apiKey, description: '1' });
  if (typeof args.latitude === 'number' && typeof args.longitude === 'number') {
    qs.set('latitude', String(args.latitude));
    qs.set('longitude', String(args.longitude));
    qs.set('radius', String(clamp(numArg(args.radius, 10), 1, 100)));
  }
  if (typeof args.keyword === 'string' && args.keyword.trim()) qs.set('keyword', args.keyword.trim());
  if (typeof args.category === 'string' && args.category.trim()) qs.set('eventcode', args.category.trim().toUpperCase());
  qs.set('minDate', dateArg(args.from) || todayISO());
  if (dateArg(args.to)) qs.set('maxDate', dateArg(args.to));
  const order = typeof args.order === 'string' ? args.order : 'date';
  qs.set('order', ['date', 'distance', 'trending', 'alphabetical'].includes(order) ? order : 'date');
  qs.set('limit', String(clamp(numArg(args.limit, 20), 1, 100)));
  qs.set('offset', String(Math.max(0, numArg(args.offset, 0))));

  const data = await skiddleGet(`/events/?${qs.toString()}`);
  const results = (data.results as SkiddleEvent[]) ?? [];
  return {
    country: 'United Kingdom',
    source: 'skiddle.com',
    total_matching: data.totalcount ?? results.length,
    count: results.length,
    events: results.map(normalize),
  };
}

async function getEvent(apiKey: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id ?? '').trim();
  if (!id) throw new Error('Pass an event `id`.');
  const data = await skiddleGet(`/events/${encodeURIComponent(id)}/?api_key=${encodeURIComponent(apiKey)}&description=1`);
  const ev = (data.results as SkiddleEvent) ?? (Array.isArray(data.results) ? data.results[0] : undefined);
  if (!ev) throw new Error(`No Skiddle event found for id "${id}".`);
  return normalize(ev);
}

interface SkiddleVenue { name?: string; address?: string; town?: string; postcode?: string; country?: string; latitude?: string | number; longitude?: string | number }
interface SkiddleEvent {
  id?: string | number;
  eventname?: string;
  description?: string;
  venue?: SkiddleVenue;
  date?: string;
  enddate?: string;
  openingtimes?: { doorsopen?: string; doorsclose?: string };
  imageurl?: string;
  largeimageurl?: string;
  link?: string;
  EventCode?: string;
  minage?: string | number;
  entryprice?: string;
  imgoing?: string | number;
  goingtocount?: string | number;
}

function normalize(e: SkiddleEvent): Record<string, unknown> {
  const v = e.venue;
  return {
    id: e.id,
    name: e.eventname,
    category: e.EventCode ? CATEGORIES[e.EventCode] ?? e.EventCode : undefined,
    date: e.date,
    end_date: e.enddate && e.enddate !== e.date ? e.enddate : undefined,
    doors_open: e.openingtimes?.doorsopen || undefined,
    min_age: e.minage || undefined,
    price: e.entryprice || undefined,
    going: e.imgoing ?? e.goingtocount ?? undefined,
    venue: v
      ? {
          name: v.name,
          address: [v.address, v.town, v.postcode].filter((p) => p && String(p).trim()).join(', ') || undefined,
          town: v.town,
          latitude: numOrUndef(v.latitude),
          longitude: numOrUndef(v.longitude),
        }
      : undefined,
    summary: e.description ? e.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : undefined,
    image: e.largeimageurl || e.imageurl || undefined,
    url: e.link,
  };
}

async function skiddleGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.error === 1 || body.error === '1') {
    const msg = (body.errormessage as string) || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || /api ?key|rate limit|authoris/i.test(msg)) {
      throw new Error(`Skiddle: ${msg}. The platform key may be unset — pass your own free key via _apiKey (get one at https://www.skiddle.com/api/join.php).`);
    }
    throw new Error(`Skiddle: ${msg}`);
  }
  return body;
}

function keyOf(args: Record<string, unknown>): string {
  const k = args._apiKey;
  if (typeof k !== 'string' || !k.trim()) {
    throw new Error('Skiddle requires an API key. The gateway normally fronts a platform key; otherwise pass _apiKey (free key at https://www.skiddle.com/api/join.php).');
  }
  delete args._apiKey;
  return k.trim();
}
function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}
function dateArg(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
