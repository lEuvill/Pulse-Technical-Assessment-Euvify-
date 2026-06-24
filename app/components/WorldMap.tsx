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
    // Cosmic band: cyan (180) → violet/magenta (320), bright for the glow.
    return `hsl(${180 + (Math.abs(hash) % 140)}, 85%, 66%)`;
  }

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
  meBusy,
  target,
  onReachTarget,
  showBot,
  onBotClick,
  botPos,
}: {
  botPos?: { lat: number; lng: number } | null;
  showBot?: boolean;
  onBotClick?: () => void;
  target?: { name: string; lat: number; lng: number } | null;
  onReachTarget?: () => void;
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  meBusy: boolean;
}) {
  const botMarkerRef = useRef<Marker | null>(null);
  const onBotClickRef = useRef(onBotClick);
  useEffect(() => { onBotClickRef.current = onBotClick; });


  const targetRef = useRef(target);
  const onReachRef = useRef(onReachTarget);
  const reachedRef = useRef(false);
  const questRingRef = useRef<Marker | null>(null);
  useEffect(() => { targetRef.current = target; reachedRef.current = false; }, [target]);
  useEffect(() => { onReachRef.current = onReachTarget; });

  const keysRef = useRef<Set<string>>(new Set());
  const flyRafRef = useRef<number | null>(null);
  const flyingRef = useRef(false);
  const shipRef = useRef<HTMLDivElement>(null);
  const [shipMode, setShipMode] = useState(false);
  const shipModeRef = useRef(false);
  useEffect(() => { shipModeRef.current = shipMode; }, [shipMode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const spinRafRef = useRef<number | null>(null);
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [skinId, setSkinId] = useState("neon");
  const firstSkin = useRef(true);
  const [labelsHidden, setLabelsHidden] = useState(true);
  const labelsHiddenRef = useRef(false);

  useEffect(() => { labelsHiddenRef.current = labelsHidden; }, [labelsHidden]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    
    if (firstSkin.current) { firstSkin.current = false; return; } // skip initial
    const skin = SKINS.find((s) => s.id === skinId);
    if (skin) map.setStyle(skin.url);
  }, [skinId, ready]);
  const SKINS = [
  { id: "midnight",  name: "Midnight",   url: "mapbox://styles/mapbox/dark-v11" },
  { id: "satellite", name: "Satellite",  url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "daylight",  name: "Daylight",   url: "mapbox://styles/mapbox/light-v11" },
  { id: "streets",   name: "Streets",    url: "mapbox://styles/mapbox/streets-v12" },
  { id: "terrain",   name: "Terrain",    url: "mapbox://styles/mapbox/outdoors-v12" },
  { id: "neon",      name: "Neon Night", url: "mapbox://styles/mapbox/navigation-night-v1" },
  ];
  
  useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      if (shipMode) {
        // Low-angle orbital horizon view
        map.easeTo({ pitch: 72, zoom: Math.max(map.getZoom(), 4.2), duration: 1200 });
      } else {
        map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
        keysRef.current.clear();
        flyingRef.current = false;
      }
    }, [shipMode, ready]);

  function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371, r = (d: number) => (d * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function setLabels(map: MapboxMap, hidden: boolean) {
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type === "symbol") {
        try {
          map.setLayoutProperty(layer.id, "visibility", hidden ? "none" : "visible");
        } catch {}
      }
    }
  }
  
  function applyGlobeAtmosphere(map: MapboxMap) {
    map.setProjection("globe");
    map.setFog({
      color: "rgb(6, 5, 16)",
      "high-color": "rgb(12, 0, 41)",
      "horizon-blend": 0.25,
      "space-color": "rgb(12, 7, 24)",
      "star-intensity": 0.65,
    });
  }
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
          style: "mapbox://styles/mapbox/navigation-night-v1",
          projection: "globe", // 3D globe instead of a flat map
          center: me ? [me.lng, me.lat] : [0, 20],
          zoom: me ? 1.8 : 1.3,
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
          if (!userInteracting && !flyingRef.current && !shipModeRef.current && map.getZoom() < SPIN_BELOW_ZOOM) {
            const center = map.getCenter();
            center.lng -= DEG_PER_SEC * dt;
            map.setCenter(center);
          }
          spinRafRef.current = requestAnimationFrame(frame);
        };
        spinRafRef.current = requestAnimationFrame(frame);

          // Re-apply globe projection + atmosphere on EVERY style load — the
          // initial one AND after a skin change (setStyle resets fog/projection).
           map.on("style.load", () => {
            if (cancelled) return;
            applyGlobeAtmosphere(map);
            setLabels(map, labelsHiddenRef.current);   // ← keep label choice across skin changes
          });
          map.on("load", () => {
            if (!cancelled) setReady(true);
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

   useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      setLabels(map, labelsHidden);
    }, [labelsHidden, ready]);


  useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready || !target) return;
      let cancelled = false;
      (async () => {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled) return;
        const el = document.createElement("div");
        el.className = "quest-beacon";   
        el.style.display = "none";       // hidden until you're in range
        questRingRef.current = new mapboxgl.Marker({ element: el }).setLngLat([target.lng, target.lat]).addTo(map);
      })();
      return () => { cancelled = true; questRingRef.current?.remove(); questRingRef.current = null; };
    }, [target, ready]);

  useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      if (target) {
        setShipMode(true);
        map.scrollZoom.disable();                         // no mouse zoom during quest
        map.easeTo({ pitch: 72, zoom: 3.4, duration: 1000 }); // fixed, locked altitude
      } else {
        map.scrollZoom.enable();
        setShipMode(false);
      }
    }, [target, ready]);

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
          el.innerHTML =
            '<span class="pulse-me-core"></span>' +
            '<span class="pulse-me-ring"></span>' +
            '<span class="pulse-me-ring pulse-me-ring-2"></span>';
          meMarkerRef.current = new mapboxgl.Marker({ element: el })
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

  // Gray my own beacon while I'm in a connection (mirrors how peers see me).
    useEffect(() => {
      const el = meMarkerRef.current?.getElement();
      if (el) el.classList.toggle("is-busy", meBusy);
    }, [meBusy, me, ready]);

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
            el.style.setProperty("--dot", dotColor(peer.id));
            el.style.setProperty("--delay", `${Math.random() * 3}s`); // stagger twinkle
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
          marker.getElement().classList.toggle("is-busy", peer.busy);
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


useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      
      map.keyboard.disable(); // we handle arrows
      const keys = keysRef.current;
      const CONTROLS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "s"];
      const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
      const isTyping = () => {
          const el = document.activeElement;
          return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
        };
      const onKeyDown = (e: KeyboardEvent) => {
        const k = norm(e.key);
        if (!shipModeRef.current || !CONTROLS.includes(k) || isTyping()) return;
        keys.add(k);
        e.preventDefault();
      };
      const onKeyUp = (e: KeyboardEvent) => keys.delete(norm(e.key));
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
       
      const THRUST = 7;
        const TURN = 1.2;
        const ZOOM = 0.03;
        const TILT = 58; // lays the ship onto the tilted ground plane
        const fly = () => {
          const active = shipModeRef.current && keys.size > 0;
          flyingRef.current = active;
          if (active) {
            if (!targetRef.current) {
              if (keys.has("w")) map.setZoom(Math.max(3, map.getZoom() - ZOOM));
              if (keys.has("s")) map.setZoom(Math.min(18, map.getZoom() + ZOOM));
            }
            if (keys.has("ArrowUp")) map.panBy([0, -THRUST], { duration: 0 });
            if (keys.has("ArrowDown")) map.panBy([0, THRUST], { duration: 0 });
            if (keys.has("ArrowLeft")) map.setBearing(map.getBearing() - TURN);
            if (keys.has("ArrowRight")) map.setBearing(map.getBearing() + TURN);
           
            const bank = (keys.has("ArrowLeft") ? -14 : 0) + (keys.has("ArrowRight") ? 14 : 0);
            if (shipRef.current) {
                shipRef.current.style.transform = `translate(-50%, -50%) perspective(500px) rotateX(${TILT}deg) rotate(${bank}deg)`;
                shipRef.current.style.setProperty("--thrust", keys.has("ArrowUp") ? "1.7" : "1");  // ← here
              }
            } else if (shipRef.current) {
              shipRef.current.style.transform = `translate(-50%, -50%) perspective(500px) rotateX(${TILT}deg) rotate(0deg)`;
              shipRef.current.style.setProperty("--thrust", "1");  //  reset when idle
            }
             // Beacon: only visible in range; win when the ship touches it
            const t = targetRef.current;
            const beaconEl = questRingRef.current?.getElement();
            if (t && beaconEl && !reachedRef.current) {
              const c = map.getCenter();
              const inRange = distKm({ lat: c.lat, lng: c.lng }, t) < 200; // "significant range"
              beaconEl.style.display = inRange ? "" : "none";
              if (inRange) {
                const p = map.project([t.lng, t.lat]);
                const box = map.getContainer();
                const cx = box.clientWidth / 2;
                const cy = box.clientHeight / 2;
                if (Math.hypot(p.x - cx, p.y - cy) < 40) {   // ship "touches" beacon
                  reachedRef.current = true;
                  onReachRef.current?.();
                }
              }
            }
          flyRafRef.current = requestAnimationFrame(fly);
        };
        flyRafRef.current = requestAnimationFrame(fly); 
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        if (flyRafRef.current) cancelAnimationFrame(flyRafRef.current);
        keys.clear();
      };
    }, [ready]);

  useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      if (!showBot || !botPos) {
        botMarkerRef.current?.remove();
        botMarkerRef.current = null;
        return;
      }
      if (botMarkerRef.current) return;
      let cancelled = false;
      (async () => {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled) return;
        const el = document.createElement("button");
        el.className = "bot-dot";
        el.title = "Chat with Pulse AI";
        el.textContent = "🤖";
        el.addEventListener("click", (e) => { e.stopPropagation(); onBotClickRef.current?.(); });
        botMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([botPos.lng, botPos.lat]).addTo(map);
      })();
      return () => { cancelled = true; };
    }, [showBot, botPos, ready]);


  return (
    <div className="absolute inset-0">
      {/* Spaceship — fly the globe with arrow keys */}
        {shipMode && (
          <div
            ref={shipRef}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-10"
            style={{
                transform: "translate(-50%, -50%) perspective(500px) rotateX(58deg)",
                transition: "transform 0.15s ease-out",
              }}
          >
            <svg width="40" height="62" viewBox="0 0 40 62"
  className="drop-shadow-[0_0_12px_rgba(79,227,255,0.9)]">
                <defs>
                  <linearGradient id="shipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#9fd8ff" />
                    <stop offset="1" stopColor="#c45cff" />
                  </linearGradient>
                  <linearGradient id="flameGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.35" stopColor="#4FE3FF" />
                    <stop offset="1" stopColor="#C45CFF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="ship-flame" d="M13 32 L20 58 L27 32 Z" fill="url(#flameGrad)" />
                <path d="M20 4 L31 36 L20 28 L9 36 Z" fill="url(#shipGrad)" stroke="#dff1ff"
  strokeWidth="1.5" />
              </svg>
            
          </div>
        )}

         {!target && (
          <button
            onClick={() => setShipMode((s) => !s)}
            className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-surface px-5 py-2 text-sm text-foreground backdrop-blur-md transition hover:border-cyan/50"
          >
            {shipMode ? "Exit flight" : "🚀 Fly the globe"}
          </button>
        )}

        {shipMode && (
          <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2
  rounded-full bg-surface px-4 py-1.5 text-xs text-muted backdrop-blur-md">
            ↑↓ thrust · ← → turn W -UP S -Down altitude
          </div>
        )}
      <div ref={containerRef} className="h-full w-full bg-void" />
      {/* Skin selector */}
         <details open className="group absolute left-4 top-4 z-20">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-white/10 bg-surface px-4 py-2 text-sm text-foreground backdrop-blur-md [&::-webkit-details-marker]:hidden">
              <span className="h-2 w-2 rounded-full bg-cyan" />
              Skin
            </summary>
            <div className="mt-2 flex w-44 flex-col gap-1 rounded-2xl border border-white/10 bg-surface p-2 backdrop-blur-md">
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSkinId(s.id)}
                  className={`rounded-lg px-3 py-1.5 text-left text-sm transition hover:bg-white/10 ${
                    skinId === s.id ? "text-cyan" : "text-muted"
                  }`}
                >
                  {s.name}
                </button>
              ))}

              <div className="mt-1 border-t border-white/10 pt-1">
                <button
                  onClick={() => setLabelsHidden((v) => !v)}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted transition hover:bg-white/10"
                >
                  {labelsHidden ? "🏷️ Show labels" : "🏷️ Hide labels"}
                </button>
              </div>
            </div>
          </details>
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
