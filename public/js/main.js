/**
 * main.js — Iskan Drama SPA (Transmit Theme Edition)
 */
(function () {
  'use strict';

  var API = '/api/raw';
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

  function fetchJSON(path, params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetch(API + path + qs).then(function (r) {
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
      slug: slugOf(item),
      title: item.title || '',
      description: item.description || '',
      poster: abs(item.poster_url) || '/images/fallback.png',
      tags: item.tag_names || item.tags || [],
      category: item.category_name || '',
      episodes: typeof item.episode_count !== 'undefined' ? item.episode_count : null,
      source_type: item.source_type || '',
      external_url: abs(item.watch_url) || abs(item.url) || '',
      provider: tabLabel || item.category_name || item.source_type || '',
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
    var epBadge = m.episodes
      ? '<span class="absolute top-2.5 right-2.5 rounded-full bg-violet-600/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg backdrop-blur-md">Ep ' + m.episodes + '</span>'
      : '';

    var titleBadge = '<div class="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/85 via-black/70 to-transparent pt-8 pb-3 px-3">' +
      '<h3 class="text-sm font-bold text-white leading-snug line-clamp-2 drop-shadow-xl">' + esc(m.title) + '</h3></div>';

    var tags = (m.tags || []).slice(0, 2).map(function (t) {
      return '<span class="rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-800">#' + esc(t) + '</span>';
    }).join('');

    var poster =
      m.poster && m.poster !== '/images/fallback.png'
        ? '<img src="' + esc(m.poster) + '" alt="' + esc(m.title) + '" loading="lazy" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105">'
        : '<div class="flex h-full w-full items-center justify-center bg-slate-900 text-3xl font-extrabold text-violet-500">' + esc((m.title || 'N').trim().charAt(0).toUpperCase()) + '</div>';

    return (
      '<a href="#/detail/' + encodeURIComponent(m.id) + '" class="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3 transition-all duration-300 hover:border-violet-500/50 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-violet-500/10">' +
      '<div class="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-slate-950">' +
      poster + epBadge + titleBadge +
      '<div class="absolute inset-0 bg-slate-950/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-center justify-center backdrop-blur-[2px]">' +
      '<div class="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/40 transition-transform duration-300 group-hover:scale-110">' +
      '<svg class="h-6 w-6 ml-0.5 fill-current" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>' +
      '</div></div></div>' +
      (tags ? '<div class="mt-3 flex flex-wrap gap-1.5">' + tags + '</div>' : '') +
      '</a>'
    );
  }

  function paginationHTML(p) {
    if (!p || p.total <= 1) return '';
    var links = '';
    for (var i = 1; i <= p.total; i++) {
      links +=
        '<a href="#/?page=' + i + (state.provider ? '&provider=' + encodeURIComponent(state.provider) : '') +
        '" class="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all ' +
        (i === p.current
          ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
          : 'border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white') +
        '">' + i + '</a>';
    }
    return '<div class="flex items-center justify-center gap-2 mt-10">' + links + '</div>';
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
        var mainSection = sections.filter(function (s) { return s.tab_key === 'for-you'; })[0] || sections[0];
        var hasNext = mainSection ? (mainSection.items || []).length >= 5 : false;
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
          '<div class="flex items-center gap-3 overflow-x-auto w-full max-w-full pb-4 mb-6 border-b border-slate-800/80 px-1">' +
          '<button type="button" data-provider="" style="border-radius: 7px;" class="provider-btn whitespace-nowrap shrink-0 px-8 py-3 mx-0.5 text-xs sm:text-sm font-bold transition-all inline-flex items-center justify-center text-center cursor-pointer ' +
          (allTabActive ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30' : 'bg-slate-900/90 border border-slate-800 text-slate-200 hover:border-violet-500 hover:text-white') +
          '">' + providerIcon('', 'All') + 'All Providers</button>' +
          providers.map(function (p) {
            var active = state.provider === p.key;
            return '<button type="button" data-provider="' + esc(p.key) + '" style="border-radius: 7px;" class="provider-btn whitespace-nowrap shrink-0 px-8 py-3 mx-0.5 text-xs sm:text-sm font-bold transition-all inline-flex items-center justify-center text-center cursor-pointer ' +
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

        // Build content: flat grid tanpa label tab_label di mana pun
        var movies = sections.reduce(function (acc, s) {
          return acc.concat((s.items || []).map(function (i) { return norm(i, s.tab_label); }));
        }, []);
        var bodyHtml = '';
        var pagHTML = '';
        if (state.query) {
          bodyHtml = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 w-full">' +
            (state.queryItems || []).map(movieCard).join('') + '</div>';
        } else if (movies.length) {
          pagHTML = paginationHTML(pagination);
          bodyHtml = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 w-full">' +
            movies.map(movieCard).join('') + '</div>';
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
            fetchJSON('/search', { q: val.trim(), provider: state.provider, lang: state.lang })
              .then(function (res) {
                state.queryItems = (res.items || res.data || []).map(function (item) { return norm(item); });
                var updatedGrid = state.queryItems.length
                  ? '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 w-full">' +
                    state.queryItems.map(movieCard).join('') + '</div>'
                  : '<div class="text-center py-16"><img src="/images/empty.png" alt="" class="mx-auto h-24 opacity-30">' +
                    '<p class="mt-4 text-slate-400">Tidak ada drama "' + esc(val) + '" ditemukan.</p></div>';
                if (gc) gc.innerHTML = updatedGrid;
              })
              .catch(function () {
                state.queryItems = [];
                if (gc) gc.innerHTML = '<div class="text-center py-16 text-slate-400">Gagal memuat pencarian.</div>';
              });
          } else {
            state.queryItems = null;
            fetchSections({ lang: state.lang, provider: state.provider, 'tab_pages[for-you]': 1 })
              .then(function (newData) {
                var nSections = (newData.sections || []);
                var nMovies = nSections.reduce(function (acc, s) {
                  return acc.concat((s.items || []).map(function (item) { return norm(item, s.tab_label); }));
                }, []);
                var updatedGrid = nMovies.length
                  ? '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 w-full">' +
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
                btn.className = 'provider-btn whitespace-nowrap shrink-0 px-8 py-3 mx-0.5 text-xs sm:text-sm font-bold transition-all inline-flex items-center justify-center text-center cursor-pointer bg-violet-600 text-white shadow-lg shadow-violet-600/30';
              } else {
                btn.className = 'provider-btn whitespace-nowrap shrink-0 px-8 py-3 mx-0.5 text-xs sm:text-sm font-bold transition-all inline-flex items-center justify-center text-center cursor-pointer bg-slate-900/90 border border-slate-800 text-slate-200 hover:border-violet-500 hover:text-white';
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
        throw new Error('not found');
      });
    });
  }

  function renderDetail(id) {
    showSpinner();
    findMovie(decodeURIComponent(id))
      .then(function (m) {
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
      .then(function (m) {
        var eps = [];
        var epCount = m.episodes || 1;
        for (var i = 1; i <= epCount; i++) eps.push(i);

        function renderEpBtn(n) {
          var isCurrent = n === ep;
          if (isCurrent) {
            return '<span class="flex h-10 w-10 items-center justify-center text-xs font-bold rounded-lg bg-violet-600/50 text-white cursor-not-allowed opacity-75 ring-2 ring-violet-500/50">' + n + '</span>';
          }
          return '<a href="#/watch/' + encodeURIComponent(m.id) + '?ep=' + n + '" class="flex h-10 w-10 items-center justify-center text-xs font-bold rounded-lg transition-all border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-violet-500 hover:text-white">' + n + '</a>';
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
          '<div id="player-fallback" class="hidden absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Memuat stream...</div>' +
          '</div>' +
          '<div class="flex items-center justify-between text-sm text-slate-400 px-1">' +
          '<span class="font-medium text-slate-300">Episode ' + ep + ' of ' + eps.length + '</span>' +
          '<div class="flex items-center gap-4">' +
          autoNextToggle +
          '<a href="#/detail/' + encodeURIComponent(m.id) + '" class="text-violet-400 hover:text-violet-300 font-semibold">View Detail</a>' +
          '</div></div>' +
          '</div>' +
          '<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">' +
          '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="text-base font-bold text-white">Select Episode</h3>' +
          (ep < eps.length ? '<a href="#/watch/' + encodeURIComponent(m.id) + '?ep=' + (ep + 1) + '" class="text-xs font-semibold text-violet-400 hover:text-violet-300">Next Ep →</a>' : '') +
          '</div>' +
          '<div id="episode-list" class="flex flex-wrap gap-2 max-h-[300px] sm:max-h-[400px] overflow-y-auto pr-1">' + epList + '</div></div>' +
          '</div>';

        // Auto Next toggle listener
        var toggleEl = document.getElementById('auto-next-toggle');
        if (toggleEl) {
          toggleEl.addEventListener('change', function (e) {
            state.autoNext = e.target.checked;
          });
        }

        var provider = (m.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        var streamUrl = '/api/stream/' + encodeURIComponent(m.id) +
          '?ep=' + ep +
          '&provider=' + encodeURIComponent(provider) +
          '&title=' + encodeURIComponent(m.title) +
          '&lang=' + encodeURIComponent(state.lang);

        fetch(streamUrl)
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.ok) throw new Error(data.message || 'stream not found');
            if (data.total_eps && data.total_eps > eps.length) {
              var more = [];
              for (var i = eps.length + 1; i <= data.total_eps; i++) more.push(i);
              eps = eps.concat(more);
              var newList = eps.map(renderEpBtn).join('');
              var el = document.getElementById('episode-list');
              if (el) el.innerHTML = newList;
              var epLabel = document.querySelector('#app span');
              if (epLabel) epLabel.textContent = 'Episode ' + ep + ' of ' + eps.length;
            }
            var video = document.getElementById('hls-player');
            if (!video) return;

            // Setup ended handler for Auto Next
            video.onended = function () {
              if (state.autoNext && ep < eps.length) {
                location.hash = '#/watch/' + encodeURIComponent(m.id) + '?ep=' + (ep + 1);
              }
            };

            if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = data.url;
              video.play().catch(function () {});
            } else if (window.Hls && Hls.isSupported()) {
              var hls = new Hls();
              hls.loadSource(data.url);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, function () {
                video.play().catch(function () {});
              });
            } else {
              var fb = document.getElementById('player-fallback');
              if (fb) { fb.classList.remove('hidden'); fb.classList.add('flex'); fb.textContent = 'Browser tidak mendukung HLS.'; }
            }
          })
          .catch(function (err) {
            var fb = document.getElementById('player-fallback');
            if (fb) { fb.classList.remove('hidden'); fb.classList.add('flex'); fb.textContent = 'Gagal memuat stream: ' + esc(err.message || err); }
          });
      })
      .catch(function () { showError('Video tidak ditemukan.'); });
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
