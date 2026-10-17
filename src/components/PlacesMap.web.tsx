// Mappa sul sito: Leaflet con le mappe gratuite di OpenStreetMap (niente chiavi, niente costi).
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { boundsOf, DEFAULT_CENTER, DEFAULT_ZOOM, type Located, type MapPlace } from '@/features/map/logic';
import { priceLabel } from '@/features/places/format';
import { useTheme } from '@/theme';

import type { PlacesMapProps } from './PlacesMap.types';

export function PlacesMap({ places, me, onOpen, openLabel, focusKey }: PlacesMapProps) {
  const { colors, scheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);

  // crea la mappa una volta sola
  useEffect(() => {
    const el = container.current;
    if (!el || map.current) return;
    const m = L.map(el, { zoomControl: true, attributionControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // la mappa nasce dentro un contenitore che si dimensiona dopo: ricalcola le misure
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // tema scuro: la mappa diventa scura anche lei (colori invertiti, ma acqua e parchi restano riconoscibili)
  useEffect(() => {
    const pane = map.current?.getPanes().tilePane;
    if (pane) pane.style.filter = scheme === 'dark' ? 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)' : '';
  }, [scheme]);

  // segnaposti (ricreati quando cambiano i posti o la posizione)
  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    for (const p of places) {
      L.circleMarker([p.latitude, p.longitude], {
        radius: 10,
        weight: 3,
        color: '#ffffff',
        fillColor: p.wishlist ? colors.danger : colors.primary,
        fillOpacity: 1,
      })
        .bindPopup(() => popup(p, openLabel, colors.primary, () => openRef.current(p.id)))
        // il nome viene da internet: come testo, mai come HTML (Leaflet tratterebbe una stringa come HTML)
        .bindTooltip(document.createTextNode(p.name) as unknown as HTMLElement, { direction: 'top', offset: [0, -8] })
        .addTo(group);
    }
    if (me) {
      // il tuo punto non si tocca: così non copre i posti vicini
      L.circleMarker([me.latitude, me.longitude], {
        radius: 8,
        weight: 3,
        color: '#ffffff',
        fillColor: '#2F6FED',
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    }
  }, [places, me, colors.primary, colors.danger, openLabel]);

  // inquadratura: tutti i posti (e la tua posizione), quando cambia "focusKey"
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const bounds = boundsOf(me ? [...places, me] : places);
    if (!bounds) m.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    else m.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si ricentra solo su richiesta, non a ogni aggiornamento
  }, [focusKey]);

  // file solo per il sito: un <div> normale, come vuole Leaflet
  return <div ref={container} style={{ flex: 1, minHeight: 300, borderRadius: 16, overflow: 'hidden', zIndex: 0 }} />;
}

/** Fumetto del segnaposto, costruito senza HTML (i nomi vengono da internet: niente iniezioni). */
function popup(p: Located<MapPlace>, openLabel: string, color: string, open: () => void): HTMLElement {
  const box = document.createElement('div');
  box.style.fontFamily = 'inherit';
  const title = document.createElement('strong');
  title.textContent = `${p.wishlist ? '❤️ ' : ''}${p.name}`;
  const details = document.createElement('div');
  details.textContent = [p.cuisine, priceLabel(p.price_level), p.city].filter(Boolean).join(' · ');
  details.style.margin = '4px 0 8px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = openLabel;
  button.style.cssText = `border:0;border-radius:999px;padding:6px 14px;font-weight:700;cursor:pointer;color:#fff;background:${color};`;
  button.addEventListener('click', open);
  box.append(title, details, button);
  return box;
}
