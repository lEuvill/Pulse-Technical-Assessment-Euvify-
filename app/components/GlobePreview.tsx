 "use client";

  import { useEffect, useRef } from "react";
  import "mapbox-gl/dist/mapbox-gl.css";
  import type { Map as MapboxMap, Marker } from "mapbox-gl";
  import { poll } from "@/lib/api";

  const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  export default function GlobePreview({
    onArrival,
    projectRef,
  }: {
    onArrival?: (lng: number, lat: number) => void;
    projectRef?: { current: ((lng: number, lat: number) => { x: number; y: number }) | null };
  }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapboxMap | null>(null);
    const markersRef = useRef<Map<string, Marker>>(new Map());
    const spinRafRef = useRef<number | null>(null);
    const onArrivalRef = useRef(onArrival);
    useEffect(() => { onArrivalRef.current = onArrival; });

    useEffect(() => {
      if (!TOKEN) return;
      let cancelled = false;
      const markers = markersRef.current;
      const ephemeralId = crypto.randomUUID(); // read-only; never joins
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let ro: ResizeObserver | undefined;
      let sizeRo: ResizeObserver | undefined;

      (async () => {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
       

        // Wait until the container actually has a size before creating the map.
        // On a fresh load the effect runs before layout, so the container is 0×0
        // and Mapbox initializes blank (it only works after HMR/resize because
        // those fire once layout is done). This guarantees a real size at init.
        await new Promise<void>((resolve) => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            resolve();
            return;
          }
          sizeRo = new ResizeObserver(() => {
            if (container.clientWidth > 0 && container.clientHeight > 0) {
              sizeRo?.disconnect();
              resolve();
            }
          });
          sizeRo.observe(container);
        });
        if (cancelled) return;

        mapboxgl.accessToken = TOKEN;
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: "globe",
          center: [-35, 30],
          zoom: 2.5,
          interactive: false,
        });
        mapRef.current = map;
          if (projectRef) {
            projectRef.current = (lng, lat) => {
              const pt = map.project([lng, lat]);
              return { x: pt.x, y: pt.y };
            };
            }
        ro = new ResizeObserver(() => map.resize());
        ro.observe(container);

        map.on("load", () => {
          if (cancelled) return;
          // Remove all text labels — keep the dark vector globe, no country names
          for (const layer of map.getStyle().layers ?? []) {
            if (layer.type === "symbol") {
              map.setLayoutProperty(layer.id, "visibility", "none");
            }
          }
          map.setFog({
            color: "rgb(6, 5, 16)",            // very dark near-surface → darker globe
            "high-color": "rgb(35, 18, 78)", // bright violet halo = the highlight
            "horizon-blend": 0.25,             // soft glowing rim (raise = bigger halo)
            "space-color": "rgb(12, 7, 24)",   // cosmic dark violet space
            "star-intensity": 0.65,
          });
          map.addSource("earth-night", {
              type: "raster",
              tiles: [
                "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
              ],
              tileSize: 256,
              maxzoom: 8,
              attribution: "Imagery: NASA Black Marble",
            });
            map.addLayer({ id: "earth-night", type: "raster", source: "earth-night" });
           requestAnimationFrame(() => map.resize());
          
          const DEG_PER_SEC = 360 / 120;
          let lastTs = 0;
          const frame = (ts: number) => {
            if (cancelled) return;
            const dt = lastTs ? (ts - lastTs) / 1000 : 0;
            lastTs = ts;
            const c = map.getCenter();
            c.lng -= DEG_PER_SEC * dt;
            map.setCenter(c);
            spinRafRef.current = requestAnimationFrame(frame);
          };
          spinRafRef.current = requestAnimationFrame(frame);
        });
        
        
        let firstTick = true;
        const tick = async () => {
          try {
            const data = await poll(ephemeralId);
            if (cancelled) return;
            const seen = new Set<string>();
            for (const p of data.peers) {
              seen.add(p.id);
              if (!markers.has(p.id)) {
                if (!firstTick) onArrivalRef.current?.(p.lng, p.lat);
                const el = document.createElement("div");
                el.className = "city-light";
                el.style.setProperty("--delay", `${Math.random() * 2.5}s`);
                const m = new mapboxgl.Marker({ element: el })
                  .setLngLat([p.lng, p.lat])
                  .addTo(map);
                markers.set(p.id, m);
              }
            }
            for (const [id, m] of markers) {
              if (!seen.has(id)) { m.remove(); markers.delete(id); }
            }
            firstTick = false; // subsequent new peers are real arrivals
          } catch {}
          if (!cancelled) pollTimer = setTimeout(tick, 4000);
        };
        tick();
      })();

      return () => {
        cancelled = true;
        if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
        if (pollTimer) clearTimeout(pollTimer);
        sizeRo?.disconnect();
        ro?.disconnect();
        markers.forEach((m) => m.remove());
        markers.clear();
        mapRef.current?.remove();
        mapRef.current = null;
      };
    }, []);

     return (
      <div className="fixed inset-0 bg-void">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  }