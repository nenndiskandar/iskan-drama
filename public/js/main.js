/**
 * main.js — Iskan Drama SPA (Transmit Theme Edition)
 */
(function () {
  'use strict';

  var API = '/api/raw';
    var DC_API = '/api/dc';
    var DC_MODE = true;            // DramaboxDB (English short drama) as upstream
    var NARTO_MODE = true;         // Narto BibiShort (edge) scraper as upstream
    var NARTO_API = '/api/narto';
    var TARGET = 'https://narto-drama.com';
    var state = { lang: 'id-ID', provider: '', page: 1, autoNext: true, query: '', queryItems: null };

  function $(sel) { return document.querySelector(sel); }

  function abs(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return TARGET + url;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hideLoading() {
    var el = document.getElementById('player-loading');
    if (el) el.classList.add('hidden');
  }

  function fetchJSON(path, params) {
      var qs = params ? '?' + new URLSearchParams(params).toString() : '';
      // path yg mulai /dc/ atau /narto/ SUDAH nyertain prefix → base=/api; yg lain pake /api/raw
      var base = (path.indexOf('/dc/') === 0 || path.indexOf('/narto/') === 0) ? '/api' : API;
      return fetch(base + path + qs).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }

  function slugOf(item) {
    var raw = item.url || item.watch_url || '';
    if (!raw) return String(item.book_id || item.id || '');
    var parts = raw.split('?')[0].split('/').filter(Boolean);
    var i = parts.indexOf('watch');
    return i >= 0 ? parts[i + 1] : parts[parts.length - 1] || '';
  }

  function norm(item, tabLabel) {
    return {
      id: String(item.book_id || item.id || ''),
      book_id: String(item.book_id || ''),
      slug: item.slug || slugOf(item),
      code: item.code || '',
      provider_label: item.provider || '',
      title: item.title || '',
      description: item.description || '',
      poster: item.poster || item.poster_url ? abs(item.poster || item.poster_url) : (item.cover ? abs(item.cover) : ''),
      tags: item.tag_names || item.tags || [],
      category: (item.code ? item.provider || item.code.toUpperCase() : '') || item.category_name || '',
      episodes: typeof item.episode_count !== 'undefined' ? item.episode_count : (item.total_eps != null ? item.total_eps : null),
      source_type: item.source_type || '',
      external_url: abs(item.external_url) || abs(item.watch_url) || abs(item.url) || '',
      provider: tabLabel || item.provider || item.category_name || item.source_type || '',
      is_adult: !!item.is_adult,
    };
  }

  function showSpinner() {
    $('#app').innerHTML =
      '<div class="flex items-center justify-center py-20">' +
      '<div class="flex flex-col items-center gap-3">' +
      '<div class="h-10 w-10 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>' +
      '<span class="text-xs font-medium text-slate-500">Loading Transmit feed...</span>' +
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
    var epBadge = (m.episodes || m.total_eps)
      ? '<span class="absolute top-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold text-white">' + (m.episodes || m.total_eps) + ' ep</span>'
      : '';


    var poster =
      m.poster && m.poster !== '/images/fallback.png'
        ? '<img src="' + esc(m.poster) + '" alt="' + esc(m.title) + '" loading="lazy" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105">'
        : '<div class="flex h-full w-full items-center justify-center bg-slate-900 text-3xl font-extrabold text-violet-500">' + esc((m.title || 'N').trim().charAt(0).toUpperCase()) + '</div>';

    return (
      '<a href="#/detail/' + encodeURIComponent(m.id) + '" class="group block w-full overflow-hidden rounded-2xl transition-opacity duration-300 hover:opacity-90">' +
      '<div class="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-slate-950">' +
      poster + epBadge +
      '<div class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/40 group-hover:opacity-100">' +
      '<div class="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition-transform duration-300 group-hover:scale-110">' +
      '<svg class="h-5 w-5 ml-0.5 fill-current" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>' +
      '</div></div></div>' +
      '<div class="pt-2">' +
      '<h3 class="text-[11px] font-medium text-slate-100 leading-snug">' + esc(m.title) + '</h3>' +
      (m.category ? '<p class="mt-0.5 text-[10px] text-slate-400 truncate">' + esc(m.category) + '</p>' : '') +
      (m.tags && m.tags.length ? '<div class="mt-1 flex flex-wrap gap-1">' + m.tags.slice(0, 2).map(function (t) {
        return '<span class="rounded bg-slate-800/80 px-1 py-0.5 text-[9px] font-medium text-slate-300">#' + esc(t) + '</span>';
      }).join('') + '</div>' : '') +
      '</div>' +
      '</a>'
    );
  }

  function paginationHTML(p) {
    if (!p || p.total <= 1) return '';

    function link(page, label, cls) {
      var url = '#/?page=' + page + (state.provider ? '&provider=' + encodeURIComponent(state.provider) : '');
      return '<a href="' + url + '" class="' + cls + '">' + label + '</a>';
    }
    function numCls(i) {
      return i === p.current
        ? 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-semibold bg-violet-600 text-white shadow-lg shadow-violet-600/30'
        : 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-semibold border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white';
    }

    var total = p.total, cur = p.current;
    var MAX = 8; // window lebarnya maks 8 tombol angka
    var html = '';

    // prev
    html += cur > 1 ? link(cur - 1, '‹', 'flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:border-violet-500') : '';

    var start = Math.max(1, cur - 3);
    var end = Math.min(total, start + MAX - 1);
    start = Math.max(1, end - MAX + 1);

    if (start > 1) html += link(1, '1', numCls(1)) + '<span class="text-slate-600 px-1">…</span>';
    for (var i = start; i <= end; i++) html += link(i, String(i), numCls(i));
    if (end < total) html += '<span class="text-slate-600 px-1">…</span>' + link(total, String(total), numCls(total));

    // next
    html += cur < total ? link(cur + 1, '›', 'flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:border-violet-500') : '';

    return '<div class="flex items-center justify-center flex-wrap gap-2 mt-10">' + html + '</div>';
  }

  // ===================================================================
  // Views
  // ===================================================================
  function renderHome() {
    showSpinner();
    var params = { lang: state.lang };
    if (state.provider) params.provider = state.provider;
    if (state.page > 1) params['tab_pages[for-you]'] = state.page;

    fetchSections(params)
      .then(function (data) {
        var providers = data.providers || [];
        var sections = data.sections || [];

        // Fallback ke For You (All Providers) saat provider terpilih tak punya data
        var anyItems = sections.some(function (s) { return (s.items || []).length > 0; });
        if (!anyItems && sectionsCache && state.provider) {
          sections = sectionsCache.sections || [];
          providers = sectionsCache.providers || providers;
        }

        var mainSection = sections.filter(function (s) { return s.tab_key === 'for-you'; })[0] || sections[0];
        var hasNext = DC_MODE ? false : (mainSection ? (mainSection.items || []).length >= 5 : false);
        var pagination = {
          current: state.page,
          total: hasNext ? state.page + 5 : state.page,
        };

        // Provider Icon Helper (Favicon Google S2 API + Fallback Monogram Avatar)
        function providerIcon(pKey, pLabel) {
          if (!pKey) {
            return '<span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-400/20 text-[10px] text-violet-300 font-extrabold mr-1.5">★</span>';
          }
          var initial = (pLabel || pKey).charAt(0).toUpperCase();
          var domainMap = {
            dramabox: 'dramabox.com',
            reelshort: 'reelshort.com',
            goodshort: 'goodshort.com',
            shortmax: 'shortmax.com',
            flextv: 'flextv.cc',
            moboreels: 'moboreels.com',
            kalostv: 'kalostv.com',
            vigloo: 'vigloo.com',
            melolo: 'melolo.com',
            serealplus: 'serealplus.com'
          };
          var domain = domainMap[pKey] || (pKey + '.com');
          var iconUrl = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32';
          return '<img src="' + iconUrl + '" alt="" class="h-4 w-4 rounded-full object-cover mr-1.5 shrink-0 inline-block" onerror="this.onerror=null;this.replaceWith(document.createRange().createContextualFragment(\'<span class=\\\'inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 text-[9px] font-extrabold text-violet-300 mr-1.5 shrink-0\\\'>' + initial + '</span>\'))">';
        }

        // Provider Tabs Horizontal Scrollable Layout (Extra Horizontal Padding)
        var allTabActive = !state.provider;
        var providerTabs =
          '<div class="flex flex-wrap items-center gap-2 w-full max-w-full pb-3 mb-6 border-b border-slate-800/80 px-0.5">' +
          '<button type="button" data-provider="" style="border-radius: 9999px;" class="provider-btn whitespace-nowrap shrink-0 px-4 py-1.5 mx-0.5 text-xs sm:text-sm font-semibold transition-all inline-flex items-center justify-center text-center cursor-pointer ' +
          (allTabActive ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30' : 'bg-slate-900/90 border border-slate-800 text-slate-200 hover:border-violet-500 hover:text-white') +
          '">' + providerIcon('', 'All') + 'All Providers</button>' +
          providers.map(function (p) {
            var active = state.provider === p.key;
            return '<button type="button" data-provider="' + esc(p.key) + '" style="border-radius: 9999px;" class="provider-btn whitespace-nowrap shrink-0 px-4 py-1.5 mx-0.5 text-xs sm:text-sm font-semibold transition-all inline-flex items-center justify-center text-center cursor-pointer ' +
              (active ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30' : 'bg-slate-900/90 border border-slate-800 text-slate-200 hover:border-violet-500 hover:text-white') +
              '">' + providerIcon(p.key, p.label) + esc(p.label) + '</button>';
          }).join('') +
          '</div>';

        // Search Input Component
        var activeLabel = state.provider
          ? ((providers || []).find(function (p) { return p.key === state.provider; })?.label || state.provider)
          : 'All Providers';
        var searchInputHTML =
          '<div class="mb-8 w-full max-w-xl">' +
          '<form id="search-form" class="relative flex items-center">' +
          '<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">' +
          '<svg class="h-4 w-4 stroke-current fill-none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
          '</div>' +
          '<input type="text" id="search-input" value="' + esc(state.query || '') + '" placeholder="Cari drama di ' + esc(activeLabel) + '..." ' +
          'class="w-full rounded-2xl border border-slate-800 bg-slate-900/90 py-3 pl-11 pr-10 text-xs sm:text-sm font-medium text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 shadow-inner">' +
          (state.query ? '<button type="button" id="clear-search" class="absolute right-3 text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5">✕</button>' : '') +
          '</form></div>';

        // Hero Banner Transmit Style
        var hero =
          '<div class="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 sm:p-10 mb-6">' +
          '<div class="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl pointer-events-none"></div>' +
          '<div class="relative z-10 max-w-2xl">' +
          '<span class="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-400 mb-4">' +
          '<span class="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse"></span>Transmit Drama Index</span>' +
          '<h1 class="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">' +
          'Latest Short Drama Releases' +
          '</h1>' +
          '<p class="mt-3 text-sm text-slate-400 leading-relaxed">' +
          'Watch mini drama series, short episodes, and anime streams directly on your browser with Transmit layout.' +
          '</p></div></div>';

        // Build content: pisah per seksi dengan judul label (seperti trending)
        function sectionBlock(s) {
          var label = s.tab_label || s.tab_key || '';
          var allItems = (s.items || []);
          // Dracinema provider tabs filter client-side by provider code.
          if (DC_MODE && state.provider) {
            allItems = allItems.filter(function (i) { return String(i.code || '').toLowerCase() === state.provider; });
          }
          var items = allItems.map(function (i) { return norm(i, s.tab_label); });
          if (!items.length) return '';
          var head = label
            ? '<div class="flex items-center gap-2 mb-4 mt-2"><span class="h-5 w-1 rounded-full bg-violet-500"></span>' +
              '<h2 class="text-base sm:text-lg font-extrabold tracking-tight text-white">' + esc(label) + '</h2></div>'
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
          pagHTML = paginationHTML(pagination);
          bodyHtml = sections.map(sectionBlock).join('');
        } else {
          bodyHtml = '<div class="text-center py-16"><img src="/images/empty.png" alt="" class="mx-auto h-24 opacity-30">' +
            '<p class="mt-4 text-slate-400">Tidak ada drama ditemukan. Coba provider lain.</p></div>';
        }

        var grid = bodyHtml + pagHTML;
        var gridWrap = '<div id="grid-container">' + grid + '</div>';
        $('#app').innerHTML = hero + providerTabs + searchInputHTML + gridWrap;

        // Search Input Handlers
        var sInput = document.getElementById('search-input');
        var sForm = document.getElementById('search-form');
        var cBtn = document.getElementById('clear-search');
        if (sForm) {
          sForm.addEventListener('submit', function (e) { e.preventDefault(); });
        }

        function doSearch(val) {
          state.query = val;
          var gc = document.getElementById('grid-container');
          if (gc) {
            gc.innerHTML =
              '<div class="flex items-center justify-center py-20 w-full">' +
              '<div class="flex flex-col items-center gap-3">' +
              '<div class="h-9 w-9 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>' +
              '<span class="text-xs font-medium text-slate-400 animate-pulse">Memuat drama...</span>' +
              '</div></div>';
          }

          if (val.trim()) {
            // Client-side search filter over loaded sections (instant, no API call)
            var allItems = [];
            var sections = sectionsCache ? sectionsCache.sections : [];
            for (var s = 0; s < sections.length; s++) {
              var items = sections[s].items || [];
              for (var i = 0; i < items.length; i++) {
                allItems.push(norm(items[i], sections[s].tab_label));
              }
            }
            var q = val.trim().toLowerCase();
            state.queryItems = allItems.filter(function (item) {
              return (item.title || '').toLowerCase().indexOf(q) >= 0 ||
                     (item.description || '').toLowerCase().indexOf(q) >= 0;
            });
            var updatedGrid = state.queryItems.length
              ? '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 w-full">' +
                state.queryItems.map(movieCard).join('') + '</div>'
              : '<div class="text-center py-16"><img src="/images/empty.png" alt="" class="mx-auto h-24 opacity-30">' +
                '<p class="mt-4 text-slate-400">Tidak ada drama "' + esc(val) + '" ditemukan.</p></div>';
            if (gc) gc.innerHTML = updatedGrid;
          } else {
            state.queryItems = null;
            fetchSections({ lang: state.lang, provider: state.provider, 'tab_pages[for-you]': 1 })
              .then(function (newData) {
                var nSections = (newData.sections || []);
                var nMovies = nSections.reduce(function (acc, s) {
                  return acc.concat((s.items || []).map(function (item) { return norm(item, s.tab_label); }));
                }, []);
                var updatedGrid = nMovies.length
                  ? '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4 w-full">' +
                    nMovies.map(movieCard).join('') + '</div>'
                  : '<div class="text-center py-16 text-slate-400">Tidak ada drama.</div>';
                if (gc) gc.innerHTML = updatedGrid;
              });
          }
        }

        if (sInput) {
          var searchTimeout = null;
          sInput.addEventListener('input', function (e) {
            clearTimeout(searchTimeout);
            var val = e.target.value;
            searchTimeout = setTimeout(function () { doSearch(val); }, 300);
          });
        }

        if (cBtn) {
          cBtn.addEventListener('click', function () {
            state.query = '';
            if (sInput) sInput.value = '';
            doSearch('');
          });
        }

        // Add event listeners to provider buttons for smooth responsive filtering
        var btns = document.querySelectorAll('.provider-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function (e) {
            var pKey = e.currentTarget.getAttribute('data-provider');
            if (state.provider === pKey) return;
            state.provider = pKey;
            state.page = 1;
            history.replaceState(null, '', '#/?page=1' + (state.provider ? '&provider=' + encodeURIComponent(state.provider) : ''));

            // Update active state of buttons immediately
            var allBtns = document.querySelectorAll('.provider-btn');
            for (var b = 0; b < allBtns.length; b++) {
              var btn = allBtns[b];
              var isTarget = btn.getAttribute('data-provider') === (state.provider || '');
              if (isTarget) {
                btn.className = 'provider-btn whitespace-nowrap shrink-0 px-4 py-1.5 mx-0.5 text-xs sm:text-sm font-bold transition-all inline-flex items-center justify-center text-center cursor-pointer bg-violet-600 text-white shadow-lg shadow-violet-600/30';
              } else {
                btn.className = 'provider-btn whitespace-nowrap shrink-0 px-4 py-1.5 mx-0.5 text-xs sm:text-sm font-bold transition-all inline-flex items-center justify-center text-center cursor-pointer bg-slate-900/90 border border-slate-800 text-slate-200 hover:border-violet-500 hover:text-white';
              }
            }

            // Update search input placeholder
            if (sInput) {
              var pObj = (providers || []).find(function (p) { return p.key === state.provider; });
              sInput.placeholder = 'Cari drama di ' + esc(pObj ? pObj.label : 'All Providers') + '...';
            }

            doSearch(state.query || '');
          });
        }
      })
      .catch(function (err) { showError(err.message); });
  }

  var sectionsCache = null;

  function fetchSections(params) {
      if (NARTO_MODE) {
        // Narto BibiShort: sections live at /api/narto/index (scraped SSR)
        return fetchJSON('/narto/index', { page: params['tab_pages[for-you]'] || 1 }).then(function (data) {
          if (!params.provider && !params['tab_pages[for-you]']) sectionsCache = data;
          return data;
        });
      }
      if (DC_MODE) {
      // DramaboxDB: sections live at /api/dc/home
      return fetchJSON('/dc/home', { page: params['tab_pages[for-you]'] || 1 }).then(function (data) {
        if (!params.provider && !params['tab_pages[for-you]']) sectionsCache = data;
        return data;
      });
    }
    return fetchJSON('/home/providers/sections', params).then(function (data) {
      if (!params.provider && !params['tab_pages[for-you]']) sectionsCache = data;
      return data;
    });
  }

  function findMovie(id) {
    var sectionsPromise = sectionsCache
      ? Promise.resolve(sectionsCache)
      : fetchSections({ lang: state.lang });

    return sectionsPromise.then(function (data) {
      var sections = data.sections || [];
      for (var s = 0; s < sections.length; s++) {
        var items = sections[s].items || [];
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].book_id) === id || slugOf(items[i]) === id) {
            return norm(items[i], sections[s].tab_label);
          }
        }
      }
      return fetchJSON('/search', { q: id, limit: 5, lang: state.lang }).then(function (res) {
        if (res.ok && res.items && res.items.length) return norm(res.items[0]);
        // Not found — return fallback object instead of throwing
        return {
          id: id,
          title: 'Drama Tidak Ditemukan',
          description: 'Drama ini tidak tersedia di katalog Indonesia saat ini.',
          poster: '',
          episodes: 0,
          total_eps: 0,
          external_url: '',
        };
      });
    });
  }

  function renderDetail(id) {
    showSpinner();
    findMovie(decodeURIComponent(id))
      .then(function (m) {
        // Handle not found (episodes=0 from fallback)
        if (!m.episodes || m.episodes === 0) {
          $('#app').innerHTML =
            '<div class="flex flex-col items-center justify-center py-20 text-center">' +
            '<div class="text-6xl mb-4">🎭</div>' +
            '<h1 class="text-2xl font-bold text-white mb-2">' + esc(m.title) + '</h1>' +
            '<p class="text-slate-400 mb-6 max-w-md">' + esc(m.description) + '</p>' +
            '<a href="#/" class="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-all">' +
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg> Kembali ke Daftar Drama</a>' +
            '</div>';
          hideLoading();
          return;
        }
        var poster =
          m.poster && m.poster !== '/images/fallback.png'
            ? '<img src="' + esc(m.poster) + '" alt="' + esc(m.title) + '" class="w-full rounded-2xl border border-slate-800 shadow-2xl object-cover aspect-[2/3]">'
            : '<div class="flex items-center justify-center h-[380px] rounded-2xl border border-slate-800 bg-slate-900 text-5xl font-extrabold text-violet-500">' + esc((m.title || 'N').trim().charAt(0).toUpperCase()) + '</div>';

        var meta =
          (m.episodes ? '<span class="text-slate-300">📺 ' + m.episodes + ' Episodes</span>' : '') +
          (m.category ? '<span class="text-slate-300">📂 ' + esc(m.category) + '</span>' : '') +
          (m.source_type ? '<span class="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-md">' + esc(m.source_type) + '</span>' : '');

        var tags = (m.tags || []).map(function (t) {
          return '<span class="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-3 py-1 rounded-md font-medium">#' + esc(t) + '</span>';
        }).join('');

        var watchBtn = m.external_url
          ? '<a href="#/watch/' + encodeURIComponent(m.id) + '" class="mt-5 flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 shadow-lg shadow-violet-600/30 transition-all">' +
            '<svg class="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>Start Watching</a>'
          : '<div class="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 font-semibold py-3">No playable source</div>';

        $('#app').innerHTML =
          '<div class="grid md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-8 items-start">' +
          '<div>' + poster + watchBtn + '</div>' +
          '<div class="space-y-6">' +
          '<div>' +
          '<a href="#/" class="inline-flex items-center text-xs font-semibold text-violet-400 hover:text-violet-300 mb-3 gap-1">← Back to Index</a>' +
          '<h1 class="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">' + esc(m.title) + '</h1>' +
          '</div>' +
          (meta ? '<div class="flex flex-wrap gap-4 text-sm font-medium">' + meta + '</div>' : '') +
          (tags ? '<div class="flex flex-wrap gap-2">' + tags + '</div>' : '') +
          '<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">' +
          '<h2 class="text-base font-bold text-white mb-2">Synopsis</h2>' +
          '<p class="text-sm text-slate-400 leading-relaxed">' + esc(m.description || 'No synopsis available.') + '</p></div>' +
          '</div></div>';
      })
      .catch(function () { showError('Drama tidak ditemukan.'); });
  }

  function renderWatch(id, ep) {
    showSpinner();
    ep = parseInt(ep || '1', 10) || 1;
    findMovie(decodeURIComponent(id))
      .then(function (m) { startWatch(m, ep); })
      .catch(function () {
        // id tak dikenal di sections → stream resolver (/api/stream) masih bisa
        // resolve via heuristic provider. Mulai video langsung dgn title minimal.
        startWatch({ id: decodeURIComponent(id), title: 'Drama ' + decodeURIComponent(id), category: '', episodes: null }, ep, true);
      });
  }

  function startWatch(m, ep, bare) {
    var eps = [];
    var epCount = m.episodes || 1;
    for (var i = 1; i <= epCount; i++) eps.push(i);

    var video = null;       // cached <video> element
    var curEp = ep;         // episode aktif (tanpa re-render)

    function streamUrlFor(n) {
          if (NARTO_MODE) {
            // Narto BibiShort: /api/narto/watch/<bookId>/<ep>?title=<slug>
            return '/api/narto/watch/' + encodeURIComponent(m.id) +
              '/' + n +
              '?title=' + encodeURIComponent(m.slug || slugOf(m));
          }
          if (DC_MODE) {
        // DramaboxDB: /api/stream/dc/<bookId>/<ep>?title=<slug>
        return '/api/stream/dc/' + encodeURIComponent(m.id) + '/' + n +
          '?title=' + encodeURIComponent(m.slug) +
          '&lang=' + encodeURIComponent(state.lang);
      }
      var provider = (m.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      return '/api/stream/' + encodeURIComponent(m.id) +
        '?ep=' + n +
        '&provider=' + encodeURIComponent(provider) +
        '&title=' + encodeURIComponent(m.title) +
        '&lang=' + encodeURIComponent(state.lang);
    }

    // setUp+load stream utk episode tertentu ke video element (tanpa full re-render)
        function startPlayback(url, extHint) {
                          hideLoading();
                          var fb = document.getElementById('player-fallback');
                          if (fb) { fb.classList.add('hidden'); fb.classList.remove('flex'); }
                          var isMp4 = String(extHint || '').toLowerCase() === 'mp4' ||
                                      (extHint !== 'm3u8' && (url.toLowerCase().indexOf('mime_type=video_mp4') >= 0 || url.toLowerCase().endsWith('.mp4')));
                          // play via Plyr kalau ada, fallback native
                          function playVideo() {
                            if (window.__plyr) { try { window.__plyr.play().catch(function () {}); } catch (e) { video.play().catch(function () {}); } }
                            else { video.play().catch(function () {}); }
                          }
                  // Badge sumber + resolusi (di bawah player)
                                      var badge = document.getElementById('player-source-badge');
                                      var resBadge = document.getElementById('player-res-badge');
                                      if (badge) {
                                        var isTiktok = /tiktokcdn\.com/i.test(url);
                                        badge.textContent = isMp4 ? 'MP4' : 'HLS';
                                        badge.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide ' +
                                          (isMp4
                                            ? (isTiktok ? 'bg-emerald-500/90 text-black' : 'bg-sky-500/90 text-black')
                                            : 'bg-violet-500/90 text-white');
                                        badge.classList.remove('hidden');
                                        badge.title = isMp4 ? (isTiktok ? 'Sumber: TikTok CDN (MP4 langsung)' : 'Sumber: MP4 langsung') : 'Sumber: HLS (.m3u8)';
                                      }
                                      if (resBadge) {
                                        resBadge.textContent = 'Res: —';
                                        resBadge.classList.remove('hidden');
                                        // isi setelah metadata video terbaca
                                        video.addEventListener('loadedmetadata', function h() {
                                                                                  if (video.videoWidth && resBadge) {
                                                                                    resBadge.textContent = 'Res: ' + video.videoWidth + '×' + video.videoHeight;
                                                                                    resBadge.classList.remove('hidden');
                                                                                  }
                                                                                  video.removeEventListener('loadedmetadata', h);
                                                                                });
                                                                              }
                                                          // Destroy HLS instance lama agar tidak ganggu playback baru
          if (window.__hlsLast && window.__hlsLast.destroy) {
            try { window.__hlsLast.destroy(); } catch (e) {}
            window.__hlsLast = null;
          }
          video.removeAttribute('src');
          // native MP4 (incl. TikTok CDN) → set video.src langsung. Media tanpa CORS
          // tetap bisa diputar; gunakan no-referrer supaya CDN yg blok Referer jalan.
          if (isMp4) {
                      video.setAttribute('referrerpolicy', 'no-referrer');
                      try { video.crossOrigin = null; } catch (e) {}
                      video.src = url;
                      playVideo();
                      return;
                    }
          // HLS .m3u8 → hls.js
          if (window.Hls && Hls.isSupported()) {
            var isNartoHost = /(^|\.)(narto-drama\.com(:|$))/i.test(url) || /(^|\.)edge\.narto-drama\.com(:|$)/i.test(url) || /(^|\.)cdn\.narto-drama\.com(:|$)/i.test(url);
            var hls = new Hls({
              xhrSetup: function (xhr) {
                if (isNartoHost) {
                  xhr.setRequestHeader('Referer', 'https://edge.narto-drama.com/');
                  xhr.setRequestHeader('Origin', 'https://edge.narto-drama.com');
                } else {
                  // external CDN (mis. vigloo/shortmax) — Referer kosong
                  xhr.setRequestHeader('Referer', '');
                }
              }
            });
            hls.loadSource(url);
                        hls.attachMedia(video);
                        hls.on(Hls.Events.MANIFEST_PARSED, function () { playVideo(); });
                        window.__hlsLast = hls;
                      } else if (url.toLowerCase().indexOf('mime_type=video_mp4') >= 0 || url.toLowerCase().endsWith('.mp4')) {
                        video.src = url; playVideo();
                      } else {
            if (fb) { fb.classList.remove('hidden'); fb.classList.add('flex'); fb.textContent = 'Browser tidak mendukung HLS.'; }
            hideLoading();
          }
        }

    // panggil /api/stream lalu mulai playback utk episode n
        function loadEp(n) {
          curEp = n;
          hideLoading();
          // HLS instance lama harus di-destroy sebelum ganti sumber — kalau tidak,
          // hls.js keep buffering source lama & player stuck.
          if (window.__hlsLast && window.__hlsLast.destroy) {
            try { window.__hlsLast.destroy(); } catch (e) {}
            window.__hlsLast = null;
          }
          video.removeAttribute('src');
          fetch(streamUrlFor(n))
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (!data.ok) throw new Error(data.message || 'stream not found');
              if (data.total_eps && data.total_eps > eps.length) {
                for (var k = eps.length + 1; k <= data.total_eps; k++) eps.push(k);
                var el = document.getElementById('episode-list');
                if (el) el.innerHTML = eps.map(renderEpBtn).join('');
                var lab = document.querySelector('#app #ep-label');
                if (lab) lab.textContent = 'Episode ' + curEp + ' of ' + eps.length;
              }
              startPlayback(data.url, data.ext);
                            refreshActive();
            })
        .catch(function (err) {
          var fb = document.getElementById('player-fallback');
          if (fb) { fb.classList.remove('hidden'); fb.classList.add('flex'); fb.textContent = 'Gagal memuat stream: ' + esc(err.message || err); }
          hideLoading();
        });
    }

    function selectEp(n) {
      if (n === curEp) return;
      // ganti URL hash tanpa trigger hashchange → tidak re-render halaman
      history.replaceState(null, '', '#/watch/' + encodeURIComponent(m.id) + '?ep=' + n);
      loadEp(n);
      var lab = document.getElementById('ep-label');
      if (lab) lab.textContent = 'Episode ' + n + ' of ' + eps.length;
    }

    function renderEpBtn(n) {
      var isCurrent = n === curEp;
      var cls = isCurrent
        ? 'flex h-10 w-10 items-center justify-center text-xs font-bold rounded-lg bg-violet-600 text-white shadow-lg shadow-violet-600/40 cursor-pointer'
        : 'flex h-10 w-10 items-center justify-center text-xs font-bold rounded-lg transition-all border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white cursor-pointer';
      return '<button type="button" data-ep="' + n + '" class="' + cls + '">' + n + '</button>';
    }

    function refreshActive() {
      var btns = document.querySelectorAll('#episode-list button[data-ep]');
      for (var b = 0; b < btns.length; b++) {
        var n = parseInt(btns[b].getAttribute('data-ep'), 10);
        btns[b].className = n === curEp
          ? 'flex h-10 w-10 items-center justify-center text-xs font-bold rounded-lg bg-violet-600 text-white shadow-lg shadow-violet-600/40 cursor-pointer'
          : 'flex h-10 w-10 items-center justify-center text-xs font-bold rounded-lg transition-all border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white cursor-pointer';
      }
      var next = document.getElementById('next-ep-link');
      if (next) next.style.display = curEp < eps.length ? '' : 'none';
    }

    var epList = eps.map(renderEpBtn).join('');

    var autoNextToggle =
      '<label class="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300 font-medium">' +
      '<input type="checkbox" id="auto-next-toggle" ' + (state.autoNext ? 'checked' : '') + ' class="sr-only peer">' +
      '<div class="relative w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-violet-600"></div>' +
      '<span>Auto Next</span></label>';

    $('#app').innerHTML =
      '<div class="grid xl:grid-cols-[1fr_360px] gap-8 items-start">' +
      '<div class="space-y-4">' +
      '<div class="bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex justify-center items-center max-h-[75vh] mx-auto w-fit min-w-[280px] relative">' +
            '<video id="hls-player" class="max-h-[75vh] w-auto h-auto max-w-full object-contain mx-auto" controls playsinline></video>' +
            '<div id="player-loading" class="absolute inset-0 flex items-center justify-center bg-black/60">' +
            '<div class="animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500 h-10 w-10"></div>' +
            '</div>' +
            '<div id="player-fallback" class="hidden absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Memuat stream...</div>' +
            '</div>' +
            '<div class="space-y-2">' +
                  '<div class="flex items-center justify-center gap-2 text-sm text-slate-400">' +
                  '<div id="player-source-badge" class="hidden px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-700/80 text-slate-200">—</div>' +
                  '<span id="player-res-badge" class="hidden px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-700/80 text-slate-200">—</span>' +
                  '</div>' +
                  '<div class="flex items-center justify-between text-sm text-slate-400 px-1">' +
                  '<span id="ep-label" class="font-medium text-slate-300">Episode ' + ep + ' of ' + eps.length + '</span>' +
                  '<div class="flex items-center gap-4">' +
                  autoNextToggle +
                  '<a href="#/detail/' + encodeURIComponent(m.id) + '" class="text-violet-400 hover:text-violet-300 font-semibold">View Detail</a>' +
                  '</div></div></div>' +
      '</div>' +
      '<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">' +
      '<div class="flex items-center justify-between mb-4">' +
      '<h3 class="text-base font-bold text-white">Select Episode</h3>' +
      '<a id="next-ep-link" data-goep="' + (ep + 1) + '" href="javascript:void(0)" class="text-xs font-semibold text-violet-400 hover:text-violet-300">Next Ep →</a>' +
      '</div>' +
      '<div id="episode-list" class="flex flex-wrap gap-2 max-h-[300px] sm:max-h-[400px] overflow-y-auto pr-1">' + epList + '</div></div>' +
      '</div>';

    video = document.getElementById('hls-player');

    // Plyr: upgrade <video> jadi player skin (fallback native kalau CDN gagal)
        if (window.__plyr && window.__plyr.destroy) { try { window.__plyr.destroy(); } catch (e) {} window.__plyr = null; }
        function initPlyr() {
          if (window.Plyr) {
            try { window.__plyr = new Plyr(video, { autoplay: false, playsinline: true }); } catch (e) { window.__plyr = null; }
          } else { window.__plyr = null; }
        }
        initPlyr();
        // fallback: kalau Plyr belum load (CDN lambat/gagal), ambil dari cdnjs lalu init
        if (!window.__plyr) {
          var ps = document.createElement('script');
          ps.src = 'https://cdnjs.cloudflare.com/ajax/libs/plyr/3.7.8/plyr.min.js';
          ps.onload = function () { initPlyr(); };
          document.head.appendChild(ps);
        }

    // Auto Next toggle listener
    var toggleEl = document.getElementById('auto-next-toggle');
    if (toggleEl) {
      toggleEl.addEventListener('change', function (e) { state.autoNext = e.target.checked; });
    }

    // video ended → auto next (tanpa re-render)
    video.onended = function () {
      if (state.autoNext && curEp < eps.length) selectEp(curEp + 1);
    };

    // episode button click handler (delegasi)
    document.getElementById('episode-list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-ep]');
      if (btn) selectEp(parseInt(btn.getAttribute('data-ep'), 10));
    });
    var nextEl = document.getElementById('next-ep-link');
    if (nextEl) nextEl.addEventListener('click', function () { if (curEp < eps.length) selectEp(curEp + 1); });

    loadEp(ep);   // mulai episode awal
  }
  function parseHash() {
    var h = location.hash || '#/';
    var qs = h.indexOf('?');
    var path = (qs >= 0 ? h.slice(0, qs) : h).replace(/^#\/?/, '').replace(/\/$/, '');
    var params = new URLSearchParams(qs >= 0 ? h.slice(qs + 1) : '');

    state.page = parseInt(params.get('page') || '1', 10) || 1;
    state.provider = params.get('provider') || '';
    state.query = '';
    state.queryItems = null;
    var lp = params.get('lang');
    if (lp) state.lang = lp;

    var langEl = $('#lang');
    if (langEl) langEl.value = state.lang;

    var seg = path.split('/').filter(Boolean);
    if (seg[0] === 'detail' && seg[1]) return renderDetail(seg[1]);
    if (seg[0] === 'watch' && seg[1]) return renderWatch(seg[1], parseInt(params.get('ep') || '1', 10));
    return renderHome();
  }

  window.addEventListener('hashchange', parseHash);
  document.addEventListener('DOMContentLoaded', function () {
    var langEl = $('#lang');
    if (langEl) {
      langEl.addEventListener('change', function (e) {
        state.lang = e.target.value;
        parseHash();
      });
    }
    parseHash();
  });
})();
