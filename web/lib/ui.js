const paths={
portal:'M8 19c-2-2-3-4-3-7a7 7 0 0 1 14 0c0 3-1 5-3 7M9 21h6M12 4v16m-4-8 4-4 4 4',
compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15 9l-2 4-4 2 2-4 4-2Z',
map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
camera:'M5 7h3l2-3h4l2 3h3a2 2 0 0 1 2 2v10H3V9a2 2 0 0 1 2-2ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
route:'M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8v5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2',
sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4',
trophy:'M7 3h10v8a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 16v5m-4 0h8',
users:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 21v-2a7 7 0 0 1 14 0v2M20 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 2 4',
book:'M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h16M8 7h8m-8 4h6',
settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM9 3l-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 1 1 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-3-1-1-3H9Z',
arrow:'M5 12h14m-5-5 5 5-5 5',
chevron:'m9 6 6 6-6 6',
check:'m5 12 4 4L19 6',
x:'m6 6 12 12M6 18 18 6',
pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
leaf:'M20 3C9 2 3 8 5 15c6 9 17 0 15-12ZM5 21l10-12',
volume:'m3 9 5 0 5-4v14l-5-4H3V9Zm14-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
mic:'M15 5v7a3 3 0 0 1-6 0V5a3 3 0 0 1 6 0ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8',
pause:'M8 5v14m8-14v14',
play:'m8 4 12 8-12 8V4Z',
shield:'m12 3 8 3v6c0 4-5 8-8 10-3-2-8-6-8-10V6l8-3Zm-4 9 3 3 5-6',
moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z',
refresh:'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'
};
export function icon(name,cls=''){return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.sparkles}"/></svg>`;}
export function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function sprite(c,extra=''){return `<div class="companion-art ${extra}" style="--col:${c.col};--row:${c.row}" role="img" aria-label="${esc(c.name)}"></div>`;}
