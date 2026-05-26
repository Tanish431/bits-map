"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchBITSBuildings } from "@/lib/overpass";
import {
    buildColorExpression,
    buildHeightExpression,
    buildOpacityExpression,
    SELECTED_NAMES,
} from "@/lib/buildingConfig";

const BITS_CENTER: [number, number] = [75.587, 28.3638];

export default function Map() {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [is3D, setIs3D] = useState(false);
    const [loading, setLoading] = useState(true);

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

                // 2D fill
                map.addLayer({
                    id: "buildings-fill",
                    type: "fill",
                    source: "bits-buildings",
                    paint: {
                        "fill-color": buildColorExpression(),
                        "fill-opacity": buildOpacityExpression(0.65, 0.1), // selected bright, rest faint
                        "fill-outline-color": buildColorExpression(),
                    },
                });

                // 3D extrusion
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

                // Building name labels
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
                        "text-font": [
                            "Open Sans Semibold",
                            "Arial Unicode MS Bold",
                        ],
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
            } catch (err) {
                console.error("Failed to load buildings:", err);
            } finally {
                setLoading(false);
            }
        });

        return () => map.remove();
    }, []);

    const toggle3D = () => {
        const map = mapRef.current;
        if (!map) return;

        const next = !is3D;
        setIs3D(next);

        // swap layer visibility
        map.setPaintProperty("buildings-fill", "fill-opacity", next ? 0 : 0.7);
        map.setPaintProperty(
            "buildings-3d",
            "fill-extrusion-opacity",
            next ? 0.85 : 0,
        );

        // tilt the camera
        map.easeTo({
            pitch: next ? 60 : 0,
            bearing: next ? -20 : 0,
            duration: 800,
        });
    };

    return (
        <div className="relative w-full h-screen bg-black">
            {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-white text-sm">
                    Loading BITS Pilani map...
                </div>
            )}

            <div ref={containerRef} className="w-full h-full" />

            <button
                onClick={toggle3D}
                className="absolute top-4 right-4 z-10 bg-gray-900 hover:bg-gray-800 text-white text-sm px-4 py-2 rounded-lg border border-gray-700 transition"
            >
                {is3D ? "2D View" : "3D View"}
            </button>
        </div>
    );
}
