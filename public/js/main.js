/**
 * main.js — Iskan Drama SPA (AsiaBox Drama Edition)
 */
(function () {
  'use strict';

  var API = '/api/asiabox';
  var state = {
    lang: 'id-ID',
    provider: 'all',
    page: 1,
    autoNext: true,
    query: '',
    queryItems: null,
    itemsById: {}
  };

  var sectionsCache = null;

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Buang penanda "(Disulihsuarakan)", "(Dubbing)", dan "(Dub)" dari judul
  function cleanTitle(t) {
    return String(t == null ? '' : t)
      .replace(/\s*\((?:disulihsuarakan|dubbing|dub)\)\s*/gi, ' ')
      .replace(/^\(dubbing\)\s*/gi, '')
      .replace(/^\(dub\)\s*/gi, '')
      .replace(/asiabox(?:drama)?(?:\.com)?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Bersihkan branding AsiaBox dari teks sinopsis
  function cleanSynopsis(s) {
    if (!s) return '';
    return String(s)
      .replace(/(?:streaming\s+gratis\s+|saksikan\s+kisah\s+lengkapnya\s+gratis\s+|nonton\s+kisah\s+lengkapnya\s+gratis\s+|nonton\s+full\s+episode\s+gratis\s+|gratis\s+)?hanya\s+di\s+asiabox(?:drama)?(?:\.com)?\.?/gi, '')
      .replace(/https?:\/\/(?:www\.)?asiaboxdrama\.(?:com|shop)[^\s]*/gi, '')
      .replace(/asiabox(?:drama)?(?:\.com)?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+\./g, '.')
      .trim();
  }

  function hideLoading() {
    var el = document.getElementById('player-loading');
    if (el) el.classList.add('hidden');
  }

  function fetchJSON(path, params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    var fullPath = path.startsWith('/api/') ? (path + qs) : (API + path + qs);
    return fetch(fullPath).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function slugOf(item) {
    var raw = item.slug || item.id || item.book_id || '';
    return String(raw).replace(/^\/id\/movie\//, '').trim();
  }

  function norm(item, tabLabel) {
    var sid = slugOf(item);
    return {
      id: sid,
      book_id: sid,
      slug: sid,
      code: item.code || 'asiabox',
      provider_label: item.provider || 'AsiaBox',
      title: item.title || '',
      description: cleanSynopsis(item.description || ''),
      poster: item.poster || item.image || '',
      tags: item.tags || [],
      category: item.category || tabLabel || '',
      episodes: item.episodes || item.total_eps || item.episodes_count || null,
      total_eps: item.total_eps || item.episodes || item.episodes_count || null,
      external_url: item.external_url || '',
      provider: tabLabel || item.provider || 'AsiaBox',
    };
  }

  function showSpinner() {
    $('#app').innerHTML =
      '<div class="flex items-center justify-center py-20">' +
      '<div class="flex flex-col items-center gap-3">' +
      '<div class="h-10 w-10 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>' +
      '<span class="text-xs font-medium text-slate-500">Memuat katalog drama...</span>' +
      '</div></div>';
  }

  function showError(msg) {
    $('#app').innerHTML =
      '<div class="text-center py-16"><img src="/images/empty.png" alt="" class="mx-auto h-24 opacity-30">' +
      '<p class="mt-4 text-slate-400">' + esc(msg || 'Gagal memuat data. Coba lagi.') + '</p></div>';
  }

  // ===================================================================
  // Transmit Card Component
  // ===================================================================
  function movieCard(m) {
    var rawTitle = m.title || '';
    var isDub = /\((?:disulihsuarakan|dubbing|dub)\)/i.test(rawTitle) || /^\(dubbing\)/i.test(rawTitle);
    var displayTitle = cleanTitle(rawTitle);

    var dubbingBadge = isDub
      ? '<span class="absolute top-1.5 left-1.5 rounded bg-violet-600/90 px-1 py-0.5 text-[9px] font-semibold text-white">dubbing</span>'
      : '';
    var epBadge = (m.episodes || m.total_eps)
      ? '<span class="absolute top-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold text-white">' + (m.episodes || m.total_eps) + ' ep</span>'
      : '';

    var poster =
      m.poster && m.poster !== '/images/fallback.png'
        ? '<img src="' + esc(m.poster) + '" alt="' + esc(displayTitle) + '" loading="lazy" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105">'
        : '<div class="flex h-full w-full items-center justify-center bg-slate-900 text-3xl font-extrabold text-violet-500">' + esc((displayTitle || 'N').trim().charAt(0).toUpperCase()) + '</div>';

    return (
      '<a href="#/detail/' + encodeURIComponent(m.slug || m.id) + '" class="group block w-full transition-opacity duration-300 hover:opacity-90">' +
      '<div class="relative aspect-[2/3] w-full overflow-hidden rounded-t-2xl rounded-b-none bg-slate-950">' +
      poster + epBadge + dubbingBadge +
      '<div class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/40 group-hover:opacity-100">' +
      '<div class="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition-transform duration-300 group-hover:scale-110">' +
      '<svg class="h-5 w-5 ml-0.5 fill-current" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>' +
      '</div></div></div>' +
      '<div class="pt-2">' +
      '<h3 class="text-[11px] font-medium text-slate-100 leading-snug line-clamp-2">' + esc(displayTitle) + '</h3>' +
      '</div>' +
      '</a>'
    );
  }

  function paginationHTML(p) {
    if (!p) return '';
    var cur = p.current || 1;
    var hasNext = !!p.hasNext;
    var hasPrev = cur > 1;

    function link(page, label, cls) {
      var prov = state.provider ? '&provider=' + encodeURIComponent(state.provider) : '';
      return '<a href="#/?page=' + page + prov + '" class="' + cls + '">' + label + '</a>';
    }

    var btnCls = 'flex h-9 min-w-9 px-3 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-300 hover:border-violet-500 hover:text-white transition-colors';
    var curCls = 'flex h-9 min-w-9 px-3 items-center justify-center rounded-lg text-xs font-bold bg-violet-600 text-white shadow-lg shadow-violet-600/30';
    var disCls = 'flex h-9 min-w-9 px-3 items-center justify-center rounded-lg border border-slate-800/40 bg-slate-900/40 text-xs font-semibold text-slate-600 opacity-40 pointer-events-none';

    var html = '';

    // Prev button
    html += hasPrev ? link(cur - 1, '‹ Prev', btnCls) : '<span class="' + disCls + '">‹ Prev</span>';

    // Numbered pages
    if (cur === 1) {
      html += '<span class="' + curCls + '">1</span>';
      if (hasNext) html += link(2, '2', btnCls);
      if (hasNext) html += link(3, '3', btnCls);
    } else {
      html += link(1, '1', btnCls);
      if (cur > 3) html += '<span class="text-slate-600 px-1">…</span>';
      if (cur > 2) html += link(cur - 1, String(cur - 1), btnCls);
      html += '<span class="' + curCls + '">' + cur + '</span>';
      if (hasNext) html += link(cur + 1, String(cur + 1), btnCls);
    }

    // Next button
    html += hasNext ? link(cur + 1, 'Next ›', btnCls) : '<span class="' + disCls + '">Next ›</span>';

    return '<div class="flex items-center justify-center flex-wrap gap-2 mt-8 mb-4">' + html + '</div>';
  }

  // ===================================================================
  // Views
  // ===================================================================
  function renderHome() {
    var gc = document.getElementById('grid-container');
    if (gc) {
      gc.innerHTML =
        '<div class="flex items-center justify-center py-20 w-full">' +
        '<div class="flex flex-col items-center gap-3">' +
        '<div class="h-10 w-10 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>' +
        '<span class="text-xs font-medium text-slate-400 animate-pulse">Memuat drama...</span>' +
        '</div></div>';
    } else {
      showSpinner();
    }

    var params = { page: state.page, provider: state.provider || 'drama-pendek-china' };

    fetchSections(params)
      .then(function (data) {
        var providers = data.providers || [];
        var sections = data.sections || [];

        // Provider Tabs Bar
        var providerTabs = '';
        if (providers.length > 1) {
          var tabsHtml = providers.map(function (p) {
            var active = (state.provider === p.key || (!state.provider && p.key === 'all'));
            var cls = active
              ? 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white shadow-md shadow-violet-600/30'
              : 'px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:border-violet-500 hover:text-white transition-colors';
            return '<a href="#/?page=1&provider=' + encodeURIComponent(p.key) + '" class="' + cls + '">' + esc(p.label) + '</a>';
          }).join('');
          providerTabs = '<div class="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">' + tabsHtml + '</div>';
        }

        // Search Input
        var searchInputHTML =
          '<div class="mb-6">' +
          '<div class="relative max-w-md">' +
          '<input type="text" id="search-input" placeholder="Cari judul drama..." value="' + esc(state.query) + '" ' +
          'class="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pl-10 pr-10 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">' +
          '<svg class="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
          (state.query ? '<button id="clear-search" class="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs">✕</button>' : '') +
          '</div></div>';

        // Hero Banner
        var hero =
          '<div class="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 sm:p-10 mb-6">' +
          '<div class="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl pointer-events-none"></div>' +
          '<div class="relative z-10 max-w-2xl">' +
          '<span class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-400 mb-4">' +
          '<span class="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse"></span>Katalog Sub-Indo HD</span>' +
          '<h1 class="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">' +
          'Nonton Drama Pendek Gratis' +
          '</h1>' +
          '<p class="mt-3 text-sm text-slate-400 leading-relaxed">' +
          'Koleksi ribuan drama pendek Subtitle Indonesia kualitas jernih langsung putar di browser Anda.' +
          '</p></div></div>';

        function sectionBlock(s) {
          var allItems = (s.items || []);
          var items = allItems.map(function (i) {
            var n = norm(i, s.tab_label);
            if (n.id) state.itemsById[n.id] = n;
            if (n.slug) state.itemsById[n.slug] = n;
            return n;
          });
          if (!items.length) return '';
          var head = s.tab_label
            ? '<div class="flex items-center gap-2.5 mb-4 mt-6">' +
              '<span class="h-5 w-1 rounded-full bg-violet-500"></span>' +
              '<h2 class="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-2">' + esc(s.tab_label) + '</h2>' +
              '</div>'
            : '';
          var grid = '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 w-full">' +
            items.map(movieCard).join('') + '</div>';
          return '<section class="mb-10">' + head + grid + '</section>';
        }

        var bodyHtml = '';
        var pagHTML = '';

        if (state.query) {
          bodyHtml = '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 w-full">' +
            (state.queryItems || []).map(movieCard).join('') + '</div>';
        } else if (sections.length) {
          pagHTML = paginationHTML({ current: state.page, hasNext: data.has_next });
          bodyHtml = sections.map(sectionBlock).join('');
        } else {
          bodyHtml = '<div class="text-center py-16"><img src="/images/empty.png" alt="" class="mx-auto h-24 opacity-30">' +
            '<p class="mt-4 text-slate-400">Tidak ada drama ditemukan.</p></div>';
        }

        var grid = bodyHtml + pagHTML;
        var gridWrap = '<div id="grid-container">' + grid + '</div>';
        $('#app').innerHTML = hero + providerTabs + searchInputHTML + gridWrap;

        // Search Handlers
        var sInput = document.getElementById('search-input');
        var cBtn = document.getElementById('clear-search');

        function doSearch(val) {
          state.query = val;
          var container = document.getElementById('grid-container');
          var q = val.trim().toLowerCase();
          if (!q) {
            state.queryItems = null;
            renderHome();
            return;
          }

          // 1) Instant filter from accumulated items in memory
          var allItems = Object.values(state.itemsById);
          var matches = allItems.filter(function (it) {
            return (it.title || '').toLowerCase().indexOf(q) >= 0 ||
                   (it.description || '').toLowerCase().indexOf(q) >= 0 ||
                   (it.slug || '').toLowerCase().indexOf(q) >= 0;
          });

          if (matches.length > 0) {
            state.queryItems = matches;
            var updatedGrid = '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 w-full">' +
              matches.map(movieCard).join('') + '</div>';
            if (container) container.innerHTML = updatedGrid;
            return;
          }

          // 2) Server search fallback
          if (container) {
            container.innerHTML =
              '<div class="flex items-center justify-center py-20 w-full">' +
              '<div class="flex flex-col items-center gap-3">' +
              '<div class="h-9 w-9 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>' +
              '<span class="text-xs font-medium text-slate-400 animate-pulse">Mencari drama...</span>' +
              '</div></div>';
          }

          fetchJSON('/search', { q: val.trim() })
            .then(function (res) {
              var sItems = (res.items || []).map(function (it) {
                var n = norm(it);
                if (n.id) state.itemsById[n.id] = n;
                if (n.slug) state.itemsById[n.slug] = n;
                return n;
              });
              state.queryItems = sItems;
              var updatedGrid = sItems.length
                ? '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 w-full">' +
                  sItems.map(movieCard).join('') + '</div>'
                : '<div class="text-center py-16"><img src="/images/empty.png" alt="" class="mx-auto h-24 opacity-30">' +
                  '<p class="mt-4 text-slate-400">Tidak ada drama "' + esc(val) + '" ditemukan.</p></div>';
              if (container) container.innerHTML = updatedGrid;
            })
            .catch(function () {
              if (container) container.innerHTML = '<div class="text-center py-16 text-slate-400">Gagal mencari.</div>';
            });
        }

        if (sInput) {
          var searchTimeout = null;
          sInput.addEventListener('input', function (e) {
            clearTimeout(searchTimeout);
            var val = e.target.value;
            searchTimeout = setTimeout(function () { doSearch(val); }, 400);
          });
        }

        if (cBtn) {
          cBtn.addEventListener('click', function () {
            state.query = '';
            if (sInput) sInput.value = '';
            doSearch('');
          });
        }
      })
      .catch(function (err) { showError(err.message); });
  }

  function fetchSections(params) {
    return fetchJSON('/index', {
      page: params.page || 1,
      provider: params.provider || 'all'
    }).then(function (data) {
      if ((!params.provider || params.provider === 'all') && params.page === 1) sectionsCache = data;
      return data;
    });
  }

  function findMovie(id) {
    var cleanId = decodeURIComponent(id).replace(/^\/id\/movie\//, '').trim();
    var cached = state.itemsById[cleanId];
    if (cached) return Promise.resolve(cached);

    return fetchJSON('/detail/' + encodeURIComponent(cleanId))
      .then(function (d) {
        if (d && d.ok) {
          var n = norm(d);
          state.itemsById[cleanId] = n;
          return n;
        }
        return {
          id: cleanId,
          slug: cleanId,
          title: cleanTitle(cleanId),
          description: 'Drama ini siap ditonton.',
          poster: '',
          episodes: 1,
          total_eps: 1,
          external_url: '#'
        };
      })
      .catch(function () {
        return {
          id: cleanId,
          slug: cleanId,
          title: cleanTitle(cleanId),
          description: 'Drama ini siap ditonton.',
          poster: '',
          episodes: 1,
          total_eps: 1,
          external_url: '#'
        };
      });
  }

  function renderDetail(id) {
    showSpinner();
    var cleanId = decodeURIComponent(id).replace(/^\/id\/movie\//, '').trim();
    findMovie(cleanId)
      .then(function (m) {
        var displayTitle = cleanTitle(m.title);
        var poster =
          m.poster && m.poster !== '/images/fallback.png'
            ? '<img src="' + esc(m.poster) + '" alt="' + esc(displayTitle) + '" class="w-full rounded-2xl border border-slate-800 shadow-2xl object-cover aspect-[2/3]">'
            : '<div class="flex items-center justify-center h-[380px] rounded-2xl border border-slate-800 bg-slate-900 text-5xl font-extrabold text-violet-500">' + esc((displayTitle || 'N').trim().charAt(0).toUpperCase()) + '</div>';

        var meta =
          (m.episodes ? '<span class="text-slate-300">📺 ' + m.episodes + ' Episode</span>' : '') +
          (m.category ? '<span class="text-slate-300">📂 ' + esc(m.category) + '</span>' : '');

        var watchBtn =
          '<a href="#/watch/' + encodeURIComponent(m.slug || m.id) + '" class="mt-5 flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 shadow-lg shadow-violet-600/30 transition-all">' +
          '<svg class="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>Mulai Nonton</a>';

        $('#app').innerHTML =
          '<div class="grid md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-8 items-start">' +
          '<div>' + poster + watchBtn + '</div>' +
          '<div class="space-y-6">' +
          '<div>' +
          '<a href="#/" class="inline-flex items-center text-xs font-semibold text-violet-400 hover:text-violet-300 mb-3 gap-1">← Kembali ke Beranda</a>' +
          '<h1 class="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">' + esc(displayTitle) + '</h1>' +
          '</div>' +
          (meta ? '<div class="flex flex-wrap gap-4 text-sm font-medium">' + meta + '</div>' : '') +
          '<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">' +
          '<h2 class="text-base font-bold text-white mb-2">Sinopsis</h2>' +
          '<p class="text-sm text-slate-400 leading-relaxed">' + esc(m.description || 'Tidak ada sinopsis.') + '</p></div>' +
          '</div></div>';
      })
      .catch(function () { showError('Drama tidak ditemukan.'); });
  }

  function renderWatch(id, ep) {
    showSpinner();
    var cleanId = decodeURIComponent(id).replace(/^\/id\/movie\//, '').trim();
    ep = parseInt(ep || '1', 10) || 1;
    findMovie(cleanId)
      .then(function (m) { startWatch(m, ep); })
      .catch(function () {
        startWatch({ id: cleanId, slug: cleanId, title: cleanTitle(cleanId), episodes: 1 }, ep);
      });
  }

  function startWatch(m, ep) {
    var eps = [];
    var epCount = m.episodes || 1;
    for (var i = 1; i <= epCount; i++) eps.push(i);

    var player = null;
    var curEp = ep;

    function streamUrlFor(n) {
      return '/api/asiabox/watch/' + encodeURIComponent(m.slug || m.id) + '/' + n;
    }

    function loadEp(n) {
      curEp = n;
      hideLoading();
      fetch(streamUrlFor(n))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error(data.message || 'Stream tidak ditemukan');
          if (data.total_eps && data.total_eps > eps.length) {
            for (var k = eps.length + 1; k <= data.total_eps; k++) eps.push(k);
            var el = document.getElementById('episode-list');
            if (el) el.innerHTML = eps.map(renderEpBtn).join('');
            var lab = document.querySelector('#app #ep-label');
            if (lab) lab.textContent = 'Ep ' + curEp + ' / ' + eps.length;
          }
          setSource(data.url, data.ext, data.subtitle);
          refreshActive();
        })
        .catch(function (err) {
          var fb = document.getElementById('player-fallback');
          if (fb) {
            fb.classList.remove('hidden');
            fb.classList.add('flex');
            fb.textContent = 'Gagal memuat video: ' + esc(err.message || err);
          }
          hideLoading();
        });
    }

    var currentBlobUrl = null;

    function loadSubtitle(subUrl) {
      if (!subUrl || !player || !player.subtitle) return;
      fetch(subUrl)
        .then(function (r) {
          if (!r.ok) throw new Error('VTT HTTP ' + r.status);
          return r.text();
        })
        .then(function (vttText) {
          if (currentBlobUrl) {
            try { URL.revokeObjectURL(currentBlobUrl); } catch(e) {}
          }
          var blob = new Blob([vttText], { type: 'text/vtt' });
          currentBlobUrl = URL.createObjectURL(blob);
          player.subtitle.switch(currentBlobUrl, { name: 'Indo' }).then(function () {
            player.subtitle.show = true;
          }).catch(function () {});
          var ccBtn = document.getElementById('art-control-cc-btn');
          if (ccBtn) {
            ccBtn.style.display = 'inline-flex';
            ccBtn.style.background = '#8b5cf6';
          }
        })
        .catch(function (e) {
          console.warn('[subtitle] load error:', e.message);
          var ccBtn2 = document.getElementById('art-control-cc-btn');
          if (ccBtn2) ccBtn2.style.display = 'none';
        });
    }

    function setSource(url, extHint, subUrl) {
      var fb = document.getElementById('player-fallback');
      if (fb) { fb.classList.add('hidden'); fb.classList.remove('flex'); }

      var badge = document.getElementById('player-source-badge');
      if (badge) {
        badge.textContent = 'MP4 HD';
        badge.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-emerald-500/90 text-black';
        badge.classList.remove('hidden');
      }

      if (player) {
        player.switchUrl(url);
        if (subUrl) {
          loadSubtitle(subUrl);
        } else {
          try { player.subtitle.show = false; } catch (e) {}
          var ccBtn = document.getElementById('art-control-cc-btn');
          if (ccBtn) ccBtn.style.display = 'none';
        }
        player.play();
      }
    }

    var updateDrawerActive = null;

    function selectEp(n) {
      if (n === curEp) return;
      history.replaceState(null, '', '#/watch/' + encodeURIComponent(m.slug || m.id) + '?ep=' + n);
      loadEp(n);
      var lab = document.getElementById('ep-label');
      if (lab) lab.textContent = 'Ep ' + n + ' / ' + eps.length;
      var titleBadge = document.getElementById('title-ep-badge');
      if (titleBadge) titleBadge.textContent = '— Ep ' + n;
      var ctrlBtn = document.getElementById('art-control-ep-btn');
      if (ctrlBtn) ctrlBtn.textContent = 'Ep ' + n + ' ▾';
      if (updateDrawerActive) updateDrawerActive();
    }

    function renderEpBtn(n) {
      var isCurrent = n === curEp;
      var cls = isCurrent
        ? 'flex h-9 w-full items-center justify-center text-xs font-bold rounded-lg bg-violet-600 text-white shadow-lg shadow-violet-600/40 cursor-pointer'
        : 'flex h-9 w-full items-center justify-center text-xs font-bold rounded-lg transition-all border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white cursor-pointer';
      return '<button type="button" data-ep="' + n + '" class="' + cls + '">' + n + '</button>';
    }

    function refreshActive() {
      var btns = document.querySelectorAll('#episode-list button[data-ep]');
      for (var b = 0; b < btns.length; b++) {
        var n = parseInt(btns[b].getAttribute('data-ep'), 10);
        btns[b].className = n === curEp
          ? 'flex h-9 w-full items-center justify-center text-xs font-bold rounded-lg bg-violet-600 text-white shadow-lg shadow-violet-600/40 cursor-pointer'
          : 'flex h-9 w-full items-center justify-center text-xs font-bold rounded-lg transition-all border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white cursor-pointer';
      }
      var next = document.getElementById('next-ep-link');
      if (next) next.style.display = curEp < eps.length ? '' : 'none';
      var prevBtn = document.getElementById('prev-ep-btn');
      if (prevBtn) prevBtn.disabled = curEp <= 1;
      var nextBtn = document.getElementById('next-ep-btn');
      if (nextBtn) nextBtn.disabled = curEp >= eps.length;
    }

    var epList = eps.map(renderEpBtn).join('');

    var autoNextToggle =
      '<label class="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300 font-medium">' +
      '<input type="checkbox" id="auto-next-toggle" ' + (state.autoNext ? 'checked' : '') + ' class="sr-only peer">' +
      '<div class="relative w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-violet-600"></div>' +
      '<span>Auto Next</span></label>';

    var displayTitle = cleanTitle(m.title || m.slug || 'Drama');

    $('#app').innerHTML =
      '<div class="space-y-6">' +
      '  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">' +
      '    <div class="space-y-1">' +
      '      <div class="flex items-center gap-2 text-xs font-semibold text-violet-400">' +
      '        <a href="#/" class="hover:text-violet-300 transition-colors">← Beranda</a>' +
      '        <span class="text-slate-600">/</span>' +
      '        <a href="#/detail/' + encodeURIComponent(m.slug || m.id) + '" class="hover:text-violet-300 transition-colors">Detail</a>' +
      '        <span class="text-slate-600">/</span>' +
      '        <span class="text-slate-400">Nonton</span>' +
      '      </div>' +
      '      <h1 class="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">' +
      '        ' + esc(displayTitle) + ' <span id="title-ep-badge" class="text-base sm:text-lg font-normal text-violet-400 ml-1">— Ep ' + ep + '</span>' +
      '      </h1>' +
      '    </div>' +
      '  </div>' +

      '  <div class="grid lg:grid-cols-[400px_1fr] xl:grid-cols-[440px_1fr] gap-8 items-start">' +
      '    <div class="space-y-4">' +
      '      <div id="art-wrap" class="w-full rounded-2xl bg-black shadow-2xl border border-slate-800 relative overflow-hidden flex items-center justify-center">' +
      '        <div id="art-player" style="width:100%; max-width:440px; aspect-ratio: 9/16; max-height: 72vh;"></div>' +
      '        <div id="player-fallback" class="hidden absolute inset-0 bg-slate-950/90 text-red-400 text-xs p-4 items-center justify-center text-center"></div>' +
      '      </div>' +
      '      <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex flex-col items-center justify-center gap-2.5 text-center text-sm text-slate-400">' +
      '        <div class="flex items-center justify-center gap-2">' +
      '          <button type="button" id="prev-ep-btn" aria-label="Episode sebelumnya" class="flex h-8 px-3 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/90 text-xs font-semibold text-slate-300 hover:border-violet-500 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors">‹ Prev</button>' +
      '          <span id="ep-label" class="font-bold text-white text-xs px-2">Ep ' + ep + ' / ' + eps.length + '</span>' +
      '          <button type="button" id="next-ep-btn" aria-label="Episode berikutnya" class="flex h-8 px-3 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/90 text-xs font-semibold text-slate-300 hover:border-violet-500 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors">Next ›</button>' +
      '        </div>' +
      '        <div class="flex items-center justify-center gap-2">' +
      '          <div id="player-source-badge" class="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-emerald-500/90 text-black">MP4 HD</div>' +
      '          <span id="player-res-badge" class="hidden px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-800 text-slate-300">Res: —</span>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="space-y-6">' +
      '      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">' +
      '        <div class="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-3">' +
      '          <div class="flex items-center gap-2">' +
      '            <h3 class="text-sm font-bold text-white uppercase tracking-wider">Pilih Episode</h3>' +
      '            <span class="rounded bg-violet-600/20 px-2 py-0.5 text-[10px] font-semibold text-violet-400 border border-violet-500/30">Total: ' + eps.length + ' Ep</span>' +
      '          </div>' +
      '          <div>' +
      '            ' + autoNextToggle +
      '          </div>' +
      '        </div>' +
      '        <div id="episode-list" class="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-6 xl:grid-cols-8 gap-2 max-h-[260px] sm:max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">' + epList + '</div>' +
      '      </div>' +

      '      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">' +
      '        <div class="flex items-center gap-2">' +
      '          <span class="h-4 w-1 rounded-full bg-violet-500"></span>' +
      '          <h3 class="text-sm font-bold text-white uppercase tracking-wider">Informasi Drama</h3>' +
      '        </div>' +
      '        <div class="flex flex-wrap gap-2 text-xs">' +
      (m.category ? '          <span class="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300 font-medium">📂 ' + esc(m.category) + '</span>' : '') +
      '          <span class="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300 font-medium">📺 ' + eps.length + ' Episode</span>' +
      '          <span class="px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 font-medium">✓ Sub Indo HD</span>' +
      '        </div>' +
      '        <p class="text-xs sm:text-sm text-slate-400 leading-relaxed pt-1">' + esc(m.description || 'Nonton streaming drama pendek sub indo gratis kualitas HD terlengkap.') + '</p>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    if (!window.Artplayer) {
      var fb = document.getElementById('player-fallback');
      if (fb) {
        fb.classList.remove('hidden'); fb.classList.add('flex');
        fb.innerHTML = 'Player library gagal dimuat.';
      }
      hideLoading();
      return;
    }

    player = new window.Artplayer({
      container: '#art-player',
      url: '',
      subtitle: {
        url: '',
        type: 'vtt',
        style: {
          color: '#ffffff',
          fontSize: '18px',
          textShadow: '0 0 4px #000, 0 0 8px #000',
          fontWeight: '700',
          bottom: '35px',
        },
        encoding: 'utf-8',
      },
      autoplay: true,
      muted: false,
      playsInline: true,
      volume: 0.9,
      theme: '#8b5cf6',
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      mini: false,
      pip: false,
      lock: true,
      autoSize: false,
      autoOrientation: true,
      setting: true,
      loop: false,
      flip: false,
      playbackRate: true,
      hotkey: true,
      lang: 'id',
    });

    player.on('ready', function () { hideLoading(); });
    player.on('play', function () { hideLoading(); });
    player.on('error', function () { hideLoading(); });
    player.on('video:error', function () {
      var fb2 = document.getElementById('player-fallback');
      if (fb2) {
        fb2.classList.remove('hidden'); fb2.classList.add('flex');
        fb2.textContent = 'Gagal memuat video. Coba episode lain.';
      }
      hideLoading();
    });

    // In-Player Fullscreen Episode Drawer
    var epDrawer = document.createElement('div');
    epDrawer.id = 'art-ep-drawer';
    epDrawer.style.cssText = 'display:none;position:absolute;inset:0;z-index:150;background:rgba(11,15,25,0.92);backdrop-filter:blur(8px);padding:16px;flex-direction:column;overflow:hidden;';

    function renderDrawerContent() {
      var dBtns = eps.map(function (n) {
        var isCurrent = n === curEp;
        var style = isCurrent
          ? 'height:36px;border-radius:8px;background:#8b5cf6;color:#fff;font-weight:700;font-size:12px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;'
          : 'height:36px;border-radius:8px;background:rgba(30,41,59,0.85);color:#cbd5e1;font-weight:600;font-size:12px;border:1px solid rgba(51,65,85,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;';
        return '<button type="button" data-artep="' + n + '" style="' + style + '">' + n + '</button>';
      }).join('');

      epDrawer.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(51,65,85,0.6);padding-bottom:10px;margin-bottom:12px;">' +
        '  <div style="display:flex;align-items:center;gap:8px;">' +
        '    <span style="color:#fff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Pilih Episode</span>' +
        '    <span style="border-radius:4px;background:#8b5cf6;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;">Total ' + eps.length + ' Ep</span>' +
        '  </div>' +
        '  <button type="button" id="art-close-ep-drawer" style="color:#94a3b8;font-size:18px;font-weight:700;background:none;border:none;cursor:pointer;padding:4px 8px;">✕</button>' +
        '</div>' +
        '<div id="art-drawer-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(44px, 1fr));gap:8px;overflow-y:auto;flex:1;padding-right:4px;">' +
        dBtns +
        '</div>';
    }

    updateDrawerActive = function () {
      var btns = epDrawer.querySelectorAll('button[data-artep]');
      for (var i = 0; i < btns.length; i++) {
        var n = parseInt(btns[i].getAttribute('data-artep'), 10);
        btns[i].style.background = (n === curEp) ? '#8b5cf6' : 'rgba(30,41,59,0.85)';
        btns[i].style.color = (n === curEp) ? '#fff' : '#cbd5e1';
      }
    };

    renderDrawerContent();
    if (player.template && player.template.$player) {
      player.template.$player.appendChild(epDrawer);
    }

    epDrawer.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-artep]');
      if (btn) {
        var n = parseInt(btn.getAttribute('data-artep'), 10);
        epDrawer.style.display = 'none';
        selectEp(n);
      }
      if (e.target.id === 'art-close-ep-drawer' || e.target.closest('#art-close-ep-drawer')) {
        epDrawer.style.display = 'none';
      }
    });

    // Custom Controls inside ArtPlayer control bar
    try {
      player.controls.add({
        name: 'cc-btn',
        position: 'right',
        index: 8,
        html: '<button type="button" id="art-control-cc-btn" style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#8b5cf6;color:#fff;border:none;cursor:pointer;">CC</button>',
        click: function () {
          if (player.subtitle) {
            player.subtitle.show = !player.subtitle.show;
            var ccBtn = document.getElementById('art-control-cc-btn');
            if (ccBtn) {
              ccBtn.style.background = player.subtitle.show ? '#8b5cf6' : '#475569';
            }
          }
        }
      });
      player.controls.add({
        name: 'ep-drawer-btn',
        position: 'right',
        index: 10,
        html: '<button type="button" id="art-control-ep-btn" style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(139,92,246,0.9);color:#fff;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:2px;">Ep ' + curEp + ' ▾</button>',
        click: function () {
          renderDrawerContent();
          epDrawer.style.display = (epDrawer.style.display === 'none' || !epDrawer.style.display) ? 'flex' : 'none';
        }
      });
    } catch (e) {}

    player.video.addEventListener('loadedmetadata', function () {
      var resBadge = document.getElementById('player-res-badge');
      if (resBadge && player.video.videoWidth) {
        resBadge.textContent = 'Res: ' + player.video.videoWidth + '×' + player.video.videoHeight;
        resBadge.classList.remove('hidden');
      }
    });

    var toggleEl = document.getElementById('auto-next-toggle');
    if (toggleEl) {
      toggleEl.addEventListener('change', function (e) { state.autoNext = e.target.checked; });
    }

    player.video.onended = function () {
      if (state.autoNext && curEp < eps.length) selectEp(curEp + 1);
    };

    document.getElementById('episode-list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-ep]');
      if (btn) selectEp(parseInt(btn.getAttribute('data-ep'), 10));
    });

    var nextEl = document.getElementById('next-ep-link');
    if (nextEl) nextEl.addEventListener('click', function () { if (curEp < eps.length) selectEp(curEp + 1); });

    var prevBtnEl = document.getElementById('prev-ep-btn');
    if (prevBtnEl) prevBtnEl.addEventListener('click', function () { if (curEp > 1) selectEp(curEp - 1); });
    var nextBtnEl = document.getElementById('next-ep-btn');
    if (nextBtnEl) nextBtnEl.addEventListener('click', function () { if (curEp < eps.length) selectEp(curEp + 1); });

    if (window.__artLast && window.__artLast.destroy) {
      try { window.__artLast.destroy(); } catch (e) {}
      window.__artLast = null;
    }
    window.__artLast = player;
    loadEp(ep);
  }

  function parseHash() {
    var h = location.hash || '#/';
    var qs = h.indexOf('?');
    var path = (qs >= 0 ? h.slice(0, qs) : h).replace(/^#\/?/, '').replace(/\/$/, '');
    var params = new URLSearchParams(qs >= 0 ? h.slice(qs + 1) : '');

    state.page = parseInt(params.get('page') || '1', 10) || 1;
    state.provider = params.get('provider') || 'all';
    state.query = '';
    state.queryItems = null;

    var seg = path.split('/').filter(Boolean);
    if (seg[0] === 'detail' && seg[1]) return renderDetail(seg[1]);
    if (seg[0] === 'watch' && seg[1]) return renderWatch(seg[1], parseInt(params.get('ep') || '1', 10));
    return renderHome();
  }

  window.addEventListener('hashchange', parseHash);
  document.addEventListener('DOMContentLoaded', function () {
    parseHash();
  });
})();
