import AMapLoader from '@amap/amap-jsapi-loader';
import { useEffect, useRef, useState } from 'react';

export default function RealMapPanel({
  participants,
  center,
  recommendations,
  fallback,
  className = '',
  onLoadStatus
}) {
  const containerRef = useRef(null);
  const containerIdRef = useRef(`meetwe-amap-${Math.random().toString(36).slice(2)}`);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const jsKey = import.meta.env.VITE_AMAP_JS_KEY;
    const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE;
    const showControls = className.includes('fullscreen');

    setFailed(false);
    onLoadStatus?.('loading');

    if (!jsKey || !center || !containerRef.current) {
      onLoadStatus?.(!jsKey ? 'missing-key' : 'failed');
      setFailed(true);
      return;
    }

    if (securityCode) {
      window._AMapSecurityConfig = {
        securityJsCode: securityCode
      };
    }

    let disposed = false;
    let frameId = null;

    AMapLoader.load({
      key: jsKey,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar']
    })
      .then((AMap) => {
        frameId = window.requestAnimationFrame(() => {
          try {
            const container = containerRef.current;
            if (disposed || !container || !container.isConnected) {
              return;
            }

            container.innerHTML = '';
            const map = new AMap.Map(containerIdRef.current, {
              zoom: 12,
              center: [center.lng, center.lat],
              features: ['bg', 'road', 'building', 'point'],
              viewMode: '2D'
            });

            mapRef.current = map;
            const markers = [];

            participants.forEach((participant) => {
              if (!participant.location) return;
              markers.push(
                new AMap.Marker({
                  position: [participant.location.lng, participant.location.lat],
                  title: participant.name,
                  anchor: 'center',
                  content: createMarkerContent('person', participant.name || '参与者')
                })
              );
            });

            markers.push(
              new AMap.Marker({
                position: [center.lng, center.lat],
                title: '约会中心',
                anchor: 'center',
                content: createMarkerContent('center', '约会中心')
              })
            );

            recommendations.slice(0, 8).forEach((place, index) => {
              if (!place.location) return;
              markers.push(
                new AMap.Marker({
                  position: [place.location.lng, place.location.lat],
                  title: place.name,
                  anchor: 'center',
                  content: createMarkerContent('place', `推荐地点 ${index + 1}`)
                })
              );
            });

            map.add(markers);
            if (showControls && AMap.Scale) {
              map.addControl(new AMap.Scale());
            }
            if (showControls && AMap.ToolBar) {
              map.addControl(
                new AMap.ToolBar({
                  position: {
                    right: '10px',
                    top: '10px'
                  }
                })
              );
            }
            map.setFitView(markers, false, [36, 36, 36, 36]);
            window.setTimeout(() => map.resize(), 120);
            onLoadStatus?.('ready');
          } catch (error) {
            console.warn('AMap JS map load failed:', error);
            onLoadStatus?.('failed');
            setFailed(true);
          }
        });
      })
      .catch((error) => {
        console.warn('AMap JS map load failed:', error);
        onLoadStatus?.('failed');
        setFailed(true);
      });

    return () => {
      disposed = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [participants, center, recommendations, className, onLoadStatus]);

  if (failed) {
    return fallback;
  }

  return (
    <div
      id={containerIdRef.current}
      className={`real-map-panel ${className}`.trim()}
      ref={containerRef}
      aria-label="高德地图"
    />
  );
}

function createMarkerContent(type, label) {
  return `<div class="amap-custom-marker ${type}">${escapeHtml(label)}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
