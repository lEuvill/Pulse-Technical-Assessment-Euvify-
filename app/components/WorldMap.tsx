"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const spinRafRef = useRef<number | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

     (async () => {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = TOKEN;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: "globe", // 3D globe instead of a flat map
          center: me ? [me.lng, me.lat] : [0, 20],
          zoom: me ? 2.8 : 1.3,
          attributionControl: true,
        });
        mapRef.current = map;

        const SECONDS_PER_REV = 180;
        const SPIN_BELOW_ZOOM = 2.5;

        // Pause the idle spin on ANY user interaction (pan, zoom, rotate, pitch),
        // resume after a short idle. Listen to user-input events only — NOT the
        // move/zoom events our own setCenter fires, or the loop would pause itself.
        let userInteracting = false;
        let interactTimer: ReturnType<typeof setTimeout> | null = null;
        const pauseSpin = () => {
          userInteracting = true;
          if (interactTimer) clearTimeout(interactTimer);
          interactTimer = setTimeout(() => { userInteracting = false; }, 1200);
        };
        map.on("mousedown", pauseSpin);
        map.on("touchstart", pauseSpin);
        map.on("wheel", pauseSpin);        // ← the missing one (scroll-zoom)
        map.on("dragstart", pauseSpin);
        map.on("zoomstart", pauseSpin);    // ← pinch / +- buttons
        map.on("rotatestart", pauseSpin);
        map.on("pitchstart", pauseSpin);

        const DEG_PER_SEC = 360 / SECONDS_PER_REV;
        let lastTs = 0;
        const frame = (ts: number) => {
          if (cancelled) return;
          const dt = lastTs ? (ts - lastTs) / 1000 : 0;
          lastTs = ts;
          if (!userInteracting && map.getZoom() < SPIN_BELOW_ZOOM) {
            const center = map.getCenter();
            center.lng -= DEG_PER_SEC * dt;
            map.setCenter(center);
          }
          spinRafRef.current = requestAnimationFrame(frame);
        };
        spinRafRef.current = requestAnimationFrame(frame);
        map.on("load", () => {
          if (cancelled) return;
          // Atmosphere: navy lower air → violet upper air, deep-space void, stars.
          map.setFog({
            color: "rgb(10, 14, 39)",
            "high-color": "rgb(60, 30, 120)",
            "horizon-blend": 0.3,
            "space-color": "rgb(5, 6, 20)",
            "star-intensity": 0.55,
          });
          setReady(true);
          
        });
      })();

    return () => {
      cancelled = true;
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
      markers.forEach((m) => m.remove());
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = `<span class="pulse-me-label">Me</span>📍`;
        // anchor "bottom" → the pin's tip sits on the exact coordinate.
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.style.background = dotColor(peer.id);
          el.title = "Tap to connect";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        marker.getElement().style.opacity = peer.busy ? "0.35" : "1";
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-void" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {/* Online count */}
      <div className="absolute bottom-4 left-4 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
        {peers.length} online
      </div>
    </div>
  );
}
