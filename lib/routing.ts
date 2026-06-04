import bitsPathData from "@/data/bits_map_path.json";

export type RouteMode = "walk" | "cycle" | "vehicle";

type LngLat = [number, number];

interface RawFeature {
  id?: string | number;
  type?: string;
  properties?: {
    name?: unknown;
    type?: unknown;
    from?: unknown;
    to?: unknown;
    allowed?: unknown;
  };
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
}

interface RawCollection {
  type?: string;
  features?: RawFeature[];
}

interface RouteNode {
  id: string;
  name: string;
  type: string;
  lng: number;
  lat: number;
}

interface RouteEdge {
  nodeId: string;
  weight: number;
  coordinates: LngLat[];
}

interface RouteGraph {
  nodesById: Map<string, RouteNode>;
  nodeIdsByName: Map<string, string>;
  adjacency: Map<string, RouteEdge[]>;
}

export interface RouteLocation {
  id: string | number;
  name: string;
  type: string;
  lng: number;
  lat: number;
}

export interface RouteResult {
  from: string;
  to: string;
  distanceMeters: number;
  path: RouteLocation[];
  coordinates: LngLat[];
}

const graphCache = new Map<RouteMode, RouteGraph>();
const rawCollection = bitsPathData as RawCollection;

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const toRad = (value: number) => (value * Math.PI) / 180;

const isLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(Number(value[0])) &&
  Number.isFinite(Number(value[1]));

const toLngLat = (value: unknown): LngLat | null => {
  if (!isLngLat(value)) return null;
  return [Number(value[0]), Number(value[1])];
};

export const haversineMeters = (a: LngLat, b: LngLat) => {
  const earthRadius = 6371000;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

const lineDistanceMeters = (coordinates: LngLat[]) => {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
};

const getLineCoordinates = (coordinates: unknown): LngLat[] => {
  if (!Array.isArray(coordinates)) return [];
  return coordinates.map(toLngLat).filter((coord) => coord !== null);
};

const getAllowedModes = (allowed: unknown): RouteMode[] | null => {
  if (!Array.isArray(allowed)) return null;
  const modes = allowed.filter(
    (mode): mode is RouteMode =>
      mode === "walk" || mode === "cycle" || mode === "vehicle",
  );
  return modes.length ? modes : null;
};

const createGraph = (mode: RouteMode): RouteGraph => {
  const features = Array.isArray(rawCollection.features)
    ? rawCollection.features
    : [];
  const nodesById = new Map<string, RouteNode>();
  const nodeIdsByName = new Map<string, string>();
  const adjacency = new Map<string, RouteEdge[]>();

  const ensureAdjacency = (nodeId: string) => {
    if (!adjacency.has(nodeId)) adjacency.set(nodeId, []);
  };

  for (const feature of features) {
    if (feature.geometry?.type !== "Point") continue;
    const coordinates = toLngLat(feature.geometry.coordinates);
    const name = feature.properties?.name;
    if (!coordinates || typeof name !== "string" || !name.trim()) continue;

    const id = normalizeName(name);
    if (nodesById.has(id)) continue;

    const node = {
      id,
      name: name.trim(),
      lng: coordinates[0],
      lat: coordinates[1],
      type:
        typeof feature.properties?.type === "string"
          ? feature.properties.type
          : "location",
    };

    nodesById.set(id, node);
    nodeIdsByName.set(id, id);
    ensureAdjacency(id);
  }

  for (const feature of features) {
    if (feature.geometry?.type !== "LineString") continue;

    const allowedModes = getAllowedModes(feature.properties?.allowed);
    if (allowedModes && !allowedModes.includes(mode)) continue;

    const fromId = nodeIdsByName.get(normalizeName(feature.properties?.from));
    const toId = nodeIdsByName.get(normalizeName(feature.properties?.to));
    const fromNode = fromId ? nodesById.get(fromId) : undefined;
    const toNode = toId ? nodesById.get(toId) : undefined;
    if (!fromId || !toId || !fromNode || !toNode) continue;

    const coordinates = getLineCoordinates(feature.geometry.coordinates);
    const fallbackCoordinates: LngLat[] = [
      [fromNode.lng, fromNode.lat],
      [toNode.lng, toNode.lat],
    ];
    const edgeCoordinates =
      coordinates.length >= 2 ? coordinates : fallbackCoordinates;
    const weight = lineDistanceMeters(edgeCoordinates);

    ensureAdjacency(fromId);
    ensureAdjacency(toId);
    adjacency.get(fromId)?.push({
      nodeId: toId,
      weight,
      coordinates: edgeCoordinates,
    });
    adjacency.get(toId)?.push({
      nodeId: fromId,
      weight,
      coordinates: [...edgeCoordinates].reverse(),
    });
  }

  return { nodesById, nodeIdsByName, adjacency };
};

const getGraph = (mode: RouteMode) => {
  const cached = graphCache.get(mode);
  if (cached) return cached;

  const graph = createGraph(mode);
  graphCache.set(mode, graph);
  return graph;
};

const reconstructPath = (
  cameFrom: Map<string, string>,
  currentId: string,
) => {
  const fullPath = [currentId];
  let current = currentId;

  while (cameFrom.has(current)) {
    const previous = cameFrom.get(current);
    if (!previous) break;
    current = previous;
    fullPath.push(current);
  }

  return fullPath.reverse();
};

const runAStar = (graph: RouteGraph, startId: string, goalId: string) => {
  const startNode = graph.nodesById.get(startId);
  const goalNode = graph.nodesById.get(goalId);
  if (!startNode || !goalNode) return null;

  const openSet = new Set([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map([[startId, 0]]);
  const fScore = new Map([
    [
      startId,
      haversineMeters(
        [startNode.lng, startNode.lat],
        [goalNode.lng, goalNode.lat],
      ),
    ],
  ]);

  while (openSet.size > 0) {
    let current: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const nodeId of openSet) {
      const score = fScore.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (score < bestScore) {
        bestScore = score;
        current = nodeId;
      }
    }

    if (!current) break;
    if (current === goalId) return reconstructPath(cameFrom, current);

    openSet.delete(current);

    for (const neighbor of graph.adjacency.get(current) ?? []) {
      const tentative =
        (gScore.get(current) ?? Number.POSITIVE_INFINITY) + neighbor.weight;
      if (tentative >= (gScore.get(neighbor.nodeId) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      const neighborNode = graph.nodesById.get(neighbor.nodeId);
      if (!neighborNode) continue;

      cameFrom.set(neighbor.nodeId, current);
      gScore.set(neighbor.nodeId, tentative);
      fScore.set(
        neighbor.nodeId,
        tentative +
          haversineMeters(
            [neighborNode.lng, neighborNode.lat],
            [goalNode.lng, goalNode.lat],
          ),
      );
      openSet.add(neighbor.nodeId);
    }
  }

  return null;
};

export const routeLocations: RouteLocation[] = (rawCollection.features ?? [])
  .filter((feature) => feature.geometry?.type === "Point")
  .map((feature, index) => {
    const coordinates = toLngLat(feature.geometry?.coordinates);
    const name = feature.properties?.name;
    if (!coordinates || typeof name !== "string" || !name.trim()) return null;

    return {
      id: feature.id ?? `route-location-${index}`,
      name: name.trim(),
      type:
        typeof feature.properties?.type === "string"
          ? feature.properties.type
          : "location",
      lng: coordinates[0],
      lat: coordinates[1],
    };
  })
  .filter((location) => location !== null);

export const routeLocationsGeoJson = {
  type: "FeatureCollection",
  features: routeLocations.map((location) => ({
    type: "Feature",
    id: location.id,
    properties: {
      name: location.name,
      type: location.type,
    },
    geometry: {
      type: "Point",
      coordinates: [location.lng, location.lat],
    },
  })),
};

export const findRoute = (
  fromName: string,
  toName: string,
  mode: RouteMode,
): RouteResult | null => {
  const graph = getGraph(mode);
  const fromId = graph.nodeIdsByName.get(normalizeName(fromName));
  const toId = graph.nodeIdsByName.get(normalizeName(toName));
  if (!fromId || !toId) return null;

  const pathIds = runAStar(graph, fromId, toId);
  if (!pathIds?.length) return null;

  const nodes = pathIds
    .map((id) => graph.nodesById.get(id))
    .filter((node) => node !== undefined);
  const coordinates: LngLat[] = [];
  const distanceMeters = pathIds.slice(1).reduce((total, currentId, index) => {
    const previousId = pathIds[index];
    const edge = (graph.adjacency.get(previousId) ?? []).find(
      (next) => next.nodeId === currentId,
    );
    const edgeCoordinates = edge?.coordinates ?? [];

    if (edgeCoordinates.length) {
      coordinates.push(
        ...(coordinates.length ? edgeCoordinates.slice(1) : edgeCoordinates),
      );
    }

    return total + (edge?.weight ?? 0);
  }, 0);

  if (!coordinates.length) {
    coordinates.push(...nodes.map((node) => [node.lng, node.lat] as LngLat));
  }

  return {
    from: nodes[0]?.name ?? fromName,
    to: nodes[nodes.length - 1]?.name ?? toName,
    distanceMeters,
    path: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      lat: node.lat,
      lng: node.lng,
    })),
    coordinates,
  };
};
