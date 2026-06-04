"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchBITSBuildings } from "@/lib/overpass";
import {
  buildColorExpression,
  buildHeightExpression,
  buildOpacityExpression,
  SELECTED_NAMES,
} from "@/lib/buildingConfig";
import {
  findRoute,
  routeLocations,
  routeLocationsGeoJson,
  type RouteLocation,
  type RouteMode,
} from "@/lib/routing";

const BITS_CENTER: [number, number] = [75.587, 28.3638];
const ROUTING_API = "https://varmonke.pythonanywhere.com/api";
const MAX_SUGGESTIONS = 7;
const ROUTE_MODES: Array<{ id: RouteMode; label: string }> = [
  { id: "walk", label: "Walk" },
  { id: "cycle", label: "Cycle" },
  { id: "vehicle", label: "Vehicle" },
];
const INTERNAL_NODE_PATTERNS = [/\bsc\b/i, /\bcircle\b/i, /\bexit\b/i];

const emptyRouteGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: "FeatureCollection",
  features: [],
};

const isInternalNodeName = (name: string) =>
  INTERNAL_NODE_PATTERNS.some((pattern) => pattern.test(name));

const getSource = (map: maplibregl.Map, id: string) =>
  map.getSource(id) as maplibregl.GeoJSONSource | undefined;

const formatDistance = (meters: number) => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
};

type RouteLine = {
  coordinates: [number, number][];
  distanceMeters: number;
  source: "api" | "fallback";
};

type RouteState = {
  key: string;
  loading: boolean;
  route: RouteLine | null;
  error: string;
};

const getRouteKey = (
  from: RouteLocation | null,
  to: RouteLocation | null,
  mode: RouteMode,
) => `${from?.name ?? ""}|${to?.name ?? ""}|${mode}`;

const parseApiRoute = (data: unknown): RouteLine | null => {
  if (!data || typeof data !== "object") return null;

  const routeData = data as {
    coordinates?: unknown;
    distanceMeters?: unknown;
  };
  if (!Array.isArray(routeData.coordinates)) return null;

  const coordinates = routeData.coordinates
    .map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;

      const lat = Number(pair[0]);
      const lng = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return [lng, lat] as [number, number];
    })
    .filter((pair) => pair !== null);

  if (coordinates.length < 2) return null;

  return {
    coordinates,
    distanceMeters: Number(routeData.distanceMeters) || 0,
    source: "api",
  };
};

const getFallbackRoute = (
  from: RouteLocation,
  to: RouteLocation,
  mode: RouteMode,
): RouteLine | null => {
  const route = findRoute(from.name, to.name, mode);
  if (!route || route.coordinates.length < 2) return null;

  return {
    coordinates: route.coordinates,
    distanceMeters: route.distanceMeters,
    source: "fallback",
  };
};

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectingSuggestionRef = useRef(false);
  const [is3D, setIs3D] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<RouteLocation | null>(null);
  const [selectedTo, setSelectedTo] = useState<RouteLocation | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>("walk");
  const [routeState, setRouteState] = useState<RouteState>({
    key: "",
    loading: false,
    route: null,
    error: "",
  });

  const searchableLocations = useMemo(
    () =>
      routeLocations.filter(
        (location) => !isInternalNodeName(location.name.trim()),
      ),
    [],
  );
  const routeInfo = useMemo(() => {
    const key = getRouteKey(selectedFrom, selectedTo, routeMode);

    if (!selectedFrom || !selectedTo) {
      return {
        route: null,
        distanceMeters: null,
        error: "",
        loading: false,
        sameLocation: false,
      };
    }

    if (selectedFrom.name === selectedTo.name) {
      return {
        route: null,
        distanceMeters: 0,
        error: "",
        loading: false,
        sameLocation: true,
      };
    }

    if (routeState.key !== key || routeState.loading) {
      return {
        route: null,
        distanceMeters: null,
        error: "",
        loading: true,
        sameLocation: false,
      };
    }

    return {
      route: routeState.route,
      distanceMeters: routeState.route?.distanceMeters ?? null,
      error: routeState.error,
      loading: false,
      sameLocation: false,
    };
  }, [routeMode, routeState, selectedFrom, selectedTo]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: BITS_CENTER,
      zoom: 16,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        const geojson = await fetchBITSBuildings();

        map.addSource("bits-buildings", {
          type: "geojson",
          data: geojson,
        });
        map.addSource("route-locations", {
          type: "geojson",
          data: routeLocationsGeoJson as GeoJSON.FeatureCollection,
        });
        map.addSource("active-route", {
          type: "geojson",
          data: emptyRouteGeoJson,
        });

        map.addLayer({
          id: "buildings-fill",
          type: "fill",
          source: "bits-buildings",
          paint: {
            "fill-color": buildColorExpression(),
            "fill-opacity": buildOpacityExpression(0.65, 0.1),
            "fill-outline-color": buildColorExpression(),
          },
        });

        map.addLayer({
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "bits-buildings",
          paint: {
            "fill-extrusion-color": buildColorExpression(),
            "fill-extrusion-height": buildHeightExpression(),
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0,
          },
        });

        map.addLayer({
          id: "active-route-casing",
          type: "line",
          source: "active-route",
          paint: {
            "line-color": "#0f172a",
            "line-width": 9,
            "line-opacity": 0.9,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });

        map.addLayer({
          id: "active-route-line",
          type: "line",
          source: "active-route",
          paint: {
            "line-color": "#38bdf8",
            "line-width": 5,
            "line-opacity": 0.95,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });

        map.addLayer({
          id: "route-location-halo",
          type: "circle",
          source: "route-locations",
          paint: {
            "circle-radius": 6,
            "circle-color": "#020617",
            "circle-opacity": 0.8,
          },
        });

        map.addLayer({
          id: "route-location-dot",
          type: "circle",
          source: "route-locations",
          paint: {
            "circle-radius": 3.5,
            "circle-color": "#f8fafc",
            "circle-stroke-color": "#38bdf8",
            "circle-stroke-width": 1.5,
          },
        });

        map.addLayer({
          id: "buildings-labels",
          type: "symbol",
          source: "bits-buildings",
          filter: [
            "in",
            ["get", "name"],
            ["literal", Array.from(SELECTED_NAMES)],
          ],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-size": 11,
            "text-anchor": "center",
            "text-max-width": 8,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1.5,
          },
        });

        map.addLayer({
          id: "route-location-labels",
          type: "symbol",
          source: "route-locations",
          minzoom: 17,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-size": 10,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-max-width": 10,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#e2e8f0",
            "text-halo-color": "#020617",
            "text-halo-width": 1.25,
          },
        });

        setMapReady(true);
      } catch (err) {
        console.error("Failed to load buildings:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => map.remove();
  }, []);

  useEffect(() => {
    if (!selectedFrom || !selectedTo || selectedFrom.name === selectedTo.name) {
      return;
    }

    const routeKey = getRouteKey(selectedFrom, selectedTo, routeMode);
    const controller = new AbortController();

    const loadRoute = async () => {
      await Promise.resolve();

      setRouteState({
        key: routeKey,
        loading: true,
        route: null,
        error: "",
      });

      try {
        const response = await fetch(
          `${ROUTING_API}/route?from=${encodeURIComponent(
            selectedFrom.name,
          )}&to=${encodeURIComponent(selectedTo.name)}&mode=${encodeURIComponent(
            routeMode,
          )}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message =
            typeof body?.error === "string"
              ? body.error
              : "Unable to generate route.";
          throw new Error(message);
        }

        const apiRoute = parseApiRoute(await response.json());
        if (!apiRoute) throw new Error("Route API returned invalid geometry.");

        setRouteState({
          key: routeKey,
          loading: false,
          route: apiRoute,
          error: "",
        });
      } catch (error) {
        if (controller.signal.aborted) return;

        const fallbackRoute = getFallbackRoute(selectedFrom, selectedTo, routeMode);
        setRouteState({
          key: routeKey,
          loading: false,
          route: fallbackRoute,
          error: fallbackRoute
            ? ""
            : error instanceof Error
              ? error.message
              : "No path found between selected locations.",
        });
      }
    };

    void loadRoute();

    return () => controller.abort();
  }, [routeMode, selectedFrom, selectedTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (!selectedFrom || !selectedTo) {
      getSource(map, "active-route")?.setData(emptyRouteGeoJson);
      return;
    }

    if (routeInfo.sameLocation) {
      getSource(map, "active-route")?.setData(emptyRouteGeoJson);
      map.flyTo({
        center: [selectedFrom.lng, selectedFrom.lat],
        zoom: 18,
        duration: 600,
      });
      return;
    }

    if (!routeInfo.route) {
      getSource(map, "active-route")?.setData(emptyRouteGeoJson);
      return;
    }

    const routeGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: routeInfo.route.coordinates,
          },
        },
      ],
    };

    getSource(map, "active-route")?.setData(routeGeoJson);

    const bounds = routeInfo.route.coordinates.reduce(
      (nextBounds, coordinate) => nextBounds.extend(coordinate),
      new maplibregl.LngLatBounds(
        routeInfo.route.coordinates[0],
        routeInfo.route.coordinates[0],
      ),
    );
    map.fitBounds(bounds, {
      padding: { top: 150, right: 80, bottom: 80, left: 80 },
      maxZoom: 18,
      duration: 800,
    });
  }, [mapReady, routeInfo, selectedFrom, selectedTo]);

  const getSuggestions = (query: string) => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? searchableLocations.filter((location) =>
          location.name.toLowerCase().includes(normalized),
        )
      : searchableLocations;
    return filtered.slice(0, MAX_SUGGESTIONS);
  };

  const fromSuggestions = getSuggestions(fromInput);
  const toSuggestions = getSuggestions(toInput);

  const applySelection = (field: "from" | "to", location: RouteLocation) => {
    if (field === "from") {
      setFromInput(location.name);
      setSelectedFrom(location);
    } else {
      setToInput(location.name);
      setSelectedTo(location);
    }
    setActiveField(null);

    mapRef.current?.flyTo({
      center: [location.lng, location.lat],
      zoom: 18,
      duration: 650,
    });
  };

  const handleInputChange = (field: "from" | "to", value: string) => {
    if (field === "from") {
      setFromInput(value);
      setSelectedFrom(null);
    } else {
      setToInput(value);
      setSelectedTo(null);
    }
    setActiveField(field);
  };

  const validateField = (field: "from" | "to") => {
    const value = field === "from" ? fromInput : toInput;
    const match =
      searchableLocations.find(
        (location) => location.name.toLowerCase() === value.trim().toLowerCase(),
      ) ?? null;

    if (field === "from") {
      setSelectedFrom(match);
      setFromInput(match?.name ?? "");
    } else {
      setSelectedTo(match);
      setToInput(match?.name ?? "");
    }
  };

  const handleInputBlur = (field: "from" | "to") => {
    window.setTimeout(() => {
      if (selectingSuggestionRef.current) {
        selectingSuggestionRef.current = false;
        return;
      }
      setActiveField(null);
      validateField(field);
    }, 0);
  };

  const renderSuggestions = (
    field: "from" | "to",
    suggestions: RouteLocation[],
  ) => {
    if (activeField !== field) return null;

    return (
      <ul
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur"
        role="listbox"
        aria-label={`${field} suggestions`}
      >
        {suggestions.length ? (
          suggestions.map((location) => (
            <li key={`${field}-${location.id}`}>
              <button
                type="button"
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-800"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectingSuggestionRef.current = true;
                  applySelection(field, location);
                }}
              >
                <span className="truncate">{location.name}</span>
                <span className="text-xs capitalize text-slate-400">
                  {location.type}
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
        )}
      </ul>
    );
  };

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;

    const next = !is3D;
    setIs3D(next);

    map.setPaintProperty("buildings-fill", "fill-opacity", next ? 0 : 0.7);
    map.setPaintProperty(
      "buildings-3d",
      "fill-extrusion-opacity",
      next ? 0.85 : 0,
    );

    map.easeTo({
      pitch: next ? 60 : 0,
      bearing: next ? -20 : 0,
      duration: 800,
    });
  };

  return (
    <div className="relative h-screen w-full bg-black">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-sm text-white">
          Loading BITS Pilani map...
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" />

      <section
        className="absolute left-3 right-3 top-3 z-10 max-w-xl rounded-lg border border-slate-700 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur md:left-4 md:right-auto md:top-4 md:w-[420px]"
        aria-label="Route search"
      >
        <div className="grid gap-2">
          <label className="relative block">
            <span className="sr-only">Starting point</span>
            <input
              type="text"
              value={fromInput}
              autoComplete="off"
              placeholder="Starting point"
              className="h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400"
              onFocus={() => setActiveField("from")}
              onBlur={() => handleInputBlur("from")}
              onChange={(event) => handleInputChange("from", event.target.value)}
            />
            {renderSuggestions("from", fromSuggestions)}
          </label>

          <label className="relative block">
            <span className="sr-only">Destination</span>
            <input
              type="text"
              value={toInput}
              autoComplete="off"
              placeholder="Destination"
              className="h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400"
              onFocus={() => setActiveField("to")}
              onBlur={() => handleInputBlur("to")}
              onChange={(event) => handleInputChange("to", event.target.value)}
            />
            {renderSuggestions("to", toSuggestions)}
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="grid grid-cols-3 overflow-hidden rounded-md border border-slate-700"
            role="tablist"
            aria-label="Route mode"
          >
            {ROUTE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={routeMode === mode.id}
                className={`h-9 px-3 text-xs font-medium transition ${
                  routeMode === mode.id
                    ? "bg-sky-400 text-slate-950"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
                onClick={() => setRouteMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {routeInfo.loading ? (
            <p className="ml-auto text-sm font-semibold text-sky-200">
              Calculating route...
            </p>
          ) : routeInfo.distanceMeters !== null && !routeInfo.error ? (
            <p className="ml-auto text-sm font-semibold text-sky-200">
              {formatDistance(routeInfo.distanceMeters)}
              {routeInfo.route?.source === "fallback" ? " fallback" : ""}
            </p>
          ) : null}
        </div>

        {routeInfo.error ? (
          <p className="mt-2 text-sm font-medium text-rose-300">
            {routeInfo.error}
          </p>
        ) : null}
      </section>

      <button
        onClick={toggle3D}
        className="absolute right-3 top-[178px] z-10 rounded-lg border border-slate-700 bg-slate-950/90 px-4 py-2 text-sm text-white shadow-xl backdrop-blur transition hover:bg-slate-900 md:right-4 md:top-4"
      >
        {is3D ? "2D View" : "3D View"}
      </button>
    </div>
  );
}
