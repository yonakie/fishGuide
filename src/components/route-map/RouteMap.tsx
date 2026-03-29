/// <reference types="@types/google.maps" />
// src/components/route-map/RouteMap.tsx
import { useEffect, useRef } from "react";
// import { Loader } from "@googlemaps/js-api-loader";
import type { RouteData } from "../../shared";

// ── Loader 单例（模块级别，只创建一次）────────────────────
// 不能放在组件内，否则每次渲染都会 new 一个新 Loader
// ── 全局单例 Promise，防止脚本被多次注入 ──────────────────
let _googleMapsReady: Promise<void> | null = null;

function ensureGoogleMaps(): Promise<void> {
  if (_googleMapsReady) return _googleMapsReady;

  _googleMapsReady = new Promise<void>((resolve, reject) => {
    // 如果已经加载过（页面热更新等情况），直接 resolve
    if (typeof window !== "undefined" && window.google?.maps) {
      resolve();
      return;
    }
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error("Google Maps 脚本加载失败"));
    document.head.appendChild(script);
  });

  return _googleMapsReady;
}

type RouteMapProps = {
  data: RouteData;
};

export function RouteMap({ data }: RouteMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mapRef.current) return;

        let cancelled = false;
        const refs = {
            polyline:   null as google.maps.Polyline | null,
            markers:    [] as google.maps.Marker[],
            infoWindow: null as google.maps.InfoWindow | null,
        };

        // ── 生成圆形 SVG 图钉 ─────────────────────────────────
        function makePinSvg(label: string, bgColor: string): string {
            const fontSize = label.length > 1 ? 11 : 14;
            const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="${bgColor}" stroke="white" stroke-width="3"/>
                <text x="20" y="25" font-family="Arial,sans-serif" font-size="${fontSize}"
                    font-weight="bold" text-anchor="middle" fill="white">${label}</text>
            </svg>`.trim();
            return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
        }

        (async () => {
            await ensureGoogleMaps();
            if (cancelled || !mapRef.current) return;

            const map = new google.maps.Map(mapRef.current, {
            zoom: 14,
            center: { lat: data.startLat, lng: data.startLon },
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            });

            const bounds = new google.maps.LatLngBounds();

            // ── 路线折线 ───────────────────────────────────────
            const path = google.maps.geometry.encoding.decodePath(data.polyline);
            refs.polyline = new google.maps.Polyline({
            path,
            strokeColor:   "#3B82F6",
            strokeWeight:  5,
            strokeOpacity: 0.85,
            map,
            });
            path.forEach((p: google.maps.LatLng) => bounds.extend(p));

            // ── 共用的 InfoWindow（点击标记时弹出） ─────────────
            refs.infoWindow = new google.maps.InfoWindow();

            // ── 辅助函数：添加一个带 InfoWindow 的标记 ─────────
            function addMarker(
            position: google.maps.LatLngLiteral,
            label: string,
            bgColor: string,
            infoHtml: string,
            ) {
            const marker = new google.maps.Marker({
                position,
                map,
                icon: {
                url: makePinSvg(label, bgColor),
                scaledSize: new google.maps.Size(40, 40),
                anchor:     new google.maps.Point(20, 20),
                },
                // zIndex 让标记始终在折线上方
                zIndex: 10,
            });

            marker.addListener("click", () => {
                refs.infoWindow!.setContent(infoHtml);
                refs.infoWindow!.open(map, marker);
            });

            refs.markers.push(marker);
            bounds.extend(position);
            }

            // ── 起点（绿色，标"起"） ────────────────────────────
            addMarker(
            { lat: data.startLat, lng: data.startLon },
            "起",
            "#16a34a",
            `<div style="font-size:13px;line-height:1.6">
                <b>🚩 起点</b><br>${data.startName}
            </div>`,
            );

            // ── 途经景点（蓝色，标序号 1、2、3…） ──────────────
            data.spots.forEach((spot, i) => {
            addMarker(
                { lat: spot.lat, lng: spot.lon },
                String(i + 1),
                "#2563eb",
                `<div style="font-size:13px;line-height:1.6;max-width:200px">
                <b>${spot.name_zh}</b><br>
                <span style="color:#6b7280">${spot.name_en}</span><br>
                ${spot.highlight_zh ?? ""}
                </div>`,
            );
            });

            // ── 终点（红色，标"终"） ────────────────────────────
            addMarker(
            { lat: data.endLat, lng: data.endLon },
            "终",
            "#dc2626",
            `<div style="font-size:13px;line-height:1.6">
                <b>🏁 终点</b><br>${data.endName}
            </div>`,
            );

            map.fitBounds(bounds, { top: 50, right: 30, bottom: 30, left: 30 });
        })();

        return () => {
            cancelled = true;
            refs.polyline?.setMap(null);
            refs.markers.forEach((m) => m.setMap(null));
            refs.infoWindow?.close();
        };
        }, [data.polyline]);



  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "320px", borderRadius: "8px" }}
    />
  );
}
