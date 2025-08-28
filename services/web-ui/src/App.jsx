
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import axios from "axios";
import { saveAs } from "file-saver";

/* ###########################################################################
   #                                                                         #
   #                         ПЕРЕВОДЧИК (MyMemory API)                       #
   #              с простым кэшем в памяти для уменьшения запросов          #
   #                                                                         #
   ########################################################################### */

/**
 * ВАЖНО:
 * - Мы оставляем MyMemory как было, но добавляем кэш на уровне вкладки/сессии,
 *   чтобы чаще попадать в кэш и реже ловить лимиты.
 * - Если сервис выдаёт ошибку/лимит, просто возвращаем исходный текст.
 * - Логику API и интерфейс не меняем, только улучшаем надёжность.
 */

const _translateCache = new Map();

/**
 * Перевод одного текста: бережём лимиты, кешируем, отрезаем до 4900 символов.
 */
async function translateOne(text, source = "en", target = "ru") {
  if (!text) return "";
  const cacheKey = `${source}|${target}|${text}`;
  if (_translateCache.has(cacheKey)) return _translateCache.get(cacheKey);

  const q = text.slice(0, 4900);
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(q) +
    "&langpair=" +
    encodeURIComponent(`${source}|${target}`);

  try {
    const res = await fetch(url);
    const data = await res.json();
    const t = data?.responseData?.translatedText || text;
    _translateCache.set(cacheKey, t);
    return t;
  } catch {
    return text;
  }
}

/**
 * Пакетный перевод: несколько воркеров, простой прогресс.
 */
async function translateBatch(texts, { concurrency = 6, onProgress } = {}) {
  const out = new Array(texts.length);
  let done = 0;
  const idxs = texts.map((_, i) => i);

  async function worker() {
    while (idxs.length) {
      const i = idxs.shift();
      const t = await translateOne(texts[i] || "");
      out[i] = t;
      done++;
      if (onProgress) onProgress(Math.round((done / texts.length) * 100));
    }
  }

  const workers = new Array(Math.min(concurrency, texts.length))
    .fill(0)
    .map(() => worker());

  await Promise.all(workers);
  return out;
}

/* ###########################################################################
   #                                                                         #
   #                              UI УТИЛИТЫ                                 #
   #                                                                         #
   ########################################################################### */

/**
 * Иконки (простые текстовые, без внешних зависимостей).
 * Держим их тут, чтобы код таблицы был чище.
 */
const Icon = {
  FilterDot: () => <span role="img" aria-label="filter" className="ml-1">⚪</span>,
  Star: ({ filled }) => (
    <span
      className={`text-xl leading-none ${filled ? "text-yellow-400" : "text-gray-500"}`}
      role="img"
      aria-label={filled ? "favorite-on" : "favorite-off"}
    >
      ★
    </span>
  ),
};

/**
 * Простой Popover без порталов: позиционируется относительно родителя.
 * Нужен, чтобы красиво отрисовать меню фильтров в заголовках таблицы.
 */
function Popover({ open, onClose, children, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-black border border-green-600 rounded-xl shadow-xl p-3 z-30 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Маленькая разделительная точка для визуальной сетки.
 */
const Dot = () => <span className="inline-block w-1 h-1 rounded-full bg-gray-500 mx-2" />;

/**
 * Микролейбл для заголовка фильтра (кнопка «Фильтр» с точкой).
 */
function FilterLabel({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium transition ${
        active ? "bg-green-700 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"
      }`}
      onClick={onClick}
    >
      {children}
      <Icon.FilterDot />
    </button>
  );
}

/* ###########################################################################
   #                                                                         #
   #                                МОДАЛЬНОЕ ОКНО                           #
   #                                                                         #
   ########################################################################### */

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        role="button"
        aria-label="Закрыть модальное окно"
      />
      {/* card */}
      <div className="relative z-10 w-[90vw] max-w-xl bg-gray-950 border border-green-700 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-green-400">{title || "Информация"}</h3>
          <button
            className="px-3 py-1 rounded-xl bg-green-700 hover:bg-green-600 text-sm"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/* ###########################################################################
   #                                                                         #
   #                              ОСНОВНОЕ ПРИЛОЖЕНИЕ                        #
   #                                                                         #
   ########################################################################### */

export default function App() {
  /* ============================== AUTH ============================== */
  const [user, setUser] = useState(null);
  const [isRegister, setIsRegister] = useState(true);
  const [form, setForm] = useState({ username: "", password: "" });

  /* ============================== DATA ============================== */
  const [vulns, setVulns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  /* ============================== UI STATE ============================== */
  const [search, setSearch] = useState("");
  const [lang, setLang] = useState("EN");
  const [tab, setTab] = useState("Recent");

  /* ===== Translation state ===== */
  const [translated, setTranslated] = useState({});
  const [translationProgress, setTranslationProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  /* ===== Anim ===== */
  const [viewAnimKey, setViewAnimKey] = useState(0);
  const [enterVisible, setEnterVisible] = useState(false);

  /* ===== Local enrichments ===== */
  const [favorites, setFavorites] = useState({});
  const [tags, setTags] = useState({});
  const [comments, setComments] = useState({});

  /* ===== Filters ===== */
  const [cvssRange, setCvssRange] = useState([0, 10]);
  const [severityFilter, setSeverityFilter] = useState([]);
  const [dateFilter, setDateFilter] = useState("all");
  const [showCvssFilter, setShowCvssFilter] = useState(false);
  const [showSeverityFilter, setShowSeverityFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);

  /* ===== Projects modal ===== */
  const [projectsModal, setProjectsModal] = useState({ open: false, title: "", items: [] });

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

  /* ============================== PERSISTED LOCAL STATE ============================== */
  useEffect(() => {
    setFavorites(JSON.parse(localStorage.getItem("favorites") || "{}"));
    setTags(JSON.parse(localStorage.getItem("tags") || "{}"));
    setComments(JSON.parse(localStorage.getItem("comments") || "{}"));
  }, []);
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);
  useEffect(() => {
    localStorage.setItem("tags", JSON.stringify(tags));
  }, [tags]);
  useEffect(() => {
    localStorage.setItem("comments", JSON.stringify(comments));
  }, [comments]);

  /* ============================== ANIM IN ============================== */
  useEffect(() => {
    setEnterVisible(false);
    const t = setTimeout(() => setEnterVisible(true), 0);
    return () => clearTimeout(t);
  }, [viewAnimKey]);

  /* ============================== AUTH ACTIONS ============================== */
  const handleRegister = async () => {
    try {
      await axios.post(`${API_URL}/api/register`, form);
      alert("Регистрация успешна, теперь войдите");
      setIsRegister(false);
    } catch {
      alert("Ошибка регистрации");
    }
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/login`, form);
      setUser(res.data.user || form.username);
      localStorage.setItem("token", res.data.token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
      setViewAnimKey((k) => k + 1);
    } catch {
      alert("Ошибка входа");
    }
  };

  /* ============================== FETCH ============================== */
  const fetchVulns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/cves`);
      setVulns(res.data || []);
    } catch (err) {
      console.error("Ошибка загрузки CVE:", err);
    }
    setIsLoading(false);
  }, [API_URL]);

  useEffect(() => {
    if (user) fetchVulns();
    if (user) setViewAnimKey((k) => k + 1);
  }, [user, fetchVulns]);

  /* ============================== FILTERED DATA ============================== */
  const filteredVulns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return (vulns || []).filter((v) => {
      // --- Поиск ---
      const text = [
        v.cve_id,
        v.description,
        v.poc,
        (v.affected_projects || []).join(", "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !text.includes(q)) return false;

      // --- Вкладки ---
      if (tab === "Favorites" && !favorites[v.cve_id]) return false;
      if (tab === "Recent") {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const d = v.published_at ? new Date(v.published_at) : null;
        if (!d || d < weekAgo) return false;
      }

      // --- CVSS ---
      const hasCustomCvss = cvssRange[0] !== 0 || cvssRange[1] !== 10;
      if (hasCustomCvss) {
        if (v.cvss_v3_score == null) return false;
        if (v.cvss_v3_score < cvssRange[0] || v.cvss_v3_score > cvssRange[1]) {
          return false;
        }
      }

      // --- Severity ---
      if (severityFilter.length) {
        const sev = (v.cvss_v3_severity || "").toUpperCase();
        if (!sev) return false;
        if (!severityFilter.includes(sev)) return false;
      }

      // --- Фильтр по дате ---
      if (dateFilter !== "all") {
        const d = v.published_at ? new Date(v.published_at) : null;
        if (!d) return false;
        if (dateFilter === "7d") {
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (d < weekAgo) return false;
        }
        if (dateFilter === "30d") {
          const monthAgo = new Date(now);
          monthAgo.setDate(monthAgo.getDate() - 30);
          if (d < monthAgo) return false;
        }
      }

      return true;
    });
  }, [vulns, search, tab, favorites, cvssRange, severityFilter, dateFilter]);

  /* ============================== TRANSLATION (ТОЛЬКО ТОП-40) ============================== */
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (lang !== "RU") {
        setTranslated({});
        setTranslationProgress(0);
        setIsTranslating(false);
        return;
      }
      // Переводим верх таблицы (учитывая текущие фильтры/поиск/вкладку)
      const sourceList = (filteredVulns && filteredVulns.length ? filteredVulns : vulns).slice(0, 40);
      if (!sourceList.length) {
        setTranslated({});
        setTranslationProgress(0);
        setIsTranslating(false);
        return;
      }

      setIsTranslating(true);
      setTranslationProgress(0);
      setTranslated({});

      const texts = sourceList.map((v) => v.description || "");
      const translatedAll = await translateBatch(texts, {
        concurrency: 8,
        onProgress: (p) => !cancelled && setTranslationProgress(p),
      });
      if (cancelled) return;

      const map = {};
      sourceList.forEach((v, i) => (map[v.cve_id] = translatedAll[i]));
      setTranslated(map);
      setIsTranslating(false);
      setTranslationProgress(100);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [lang, vulns, filteredVulns]);

  /* ============================== FAVORITES / TAGS / COMMENTS ============================== */
  const toggleFavorite = (id) =>
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));

  const addTag = (id) => {
    const tag = prompt("Введите тег:");
    if (tag) setTags((prev) => ({ ...prev, [id]: [...(prev[id] || []), tag] }));
  };

  const addComment = (id) => {
    const comment = prompt("Введите комментарий:");
    if (comment) setComments((prev) => ({ ...prev, [id]: comment }));
  };

  /* ============================== EXPORT ============================== */
  const exportCSV = () => {
    const header = "CVE ID,Description,Published,PoC,Affected Projects\n";
    const rows = (vulns || [])
      .map((v) => {
        // Берём перевод, если RU и он подсчитан для данного CVE (в топ-40)
        const desc =
          (lang === "RU" && translated[v.cve_id]) || v.description || "-";
        const projects = v.affected_projects ? v.affected_projects.join(";") : "-";
        return `${v.cve_id},"${(desc || "").replace(/"/g, '""')}",${
          v.published_at || "-"
        },${v.poc || "-"},"${projects}"`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    saveAs(blob, "cves.csv");
  };

  const exportJSON = () => {
    const pretty = (v) => ({
      ...v,
      // Берём перевод, если есть (в топ-40), иначе оригинал
      description:
        (lang === "RU" && translated[v.cve_id]) || v.description || "-",
    });
    const blob = new Blob(
      [JSON.stringify((vulns || []).map(pretty), null, 2)],
      { type: "application/json" }
    );
    saveAs(blob, "cves.json");
  };

  /* ============================== CLEAR FILTERS ============================== */
  const clearFilters = () => {
    setCvssRange([0, 10]);
    setSeverityFilter([]);
    setDateFilter("all");
  };

  /* ###########################################################################
     #                                                                         #
     #                                  РЕНДЕР                                 #
     #                                                                         #
     ########################################################################### */

  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col items-center">
      {/* Фон «Матрицы» под всем интерфейсом */}
      <MatrixRain />

      {!user ? (
        /* ========================== AUTH VIEW ========================== */
        <div
          key={`auth-${viewAnimKey}`}
          className={`flex flex-col items-center justify-center flex-1 z-10 transition-all duration-500 ${
            enterVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <img
            src="/logo.png"
            alt="Logo"
            className="w-28 h-28 mb-6 rounded-full border border-green-400"
          />
          <h1 className="text-5xl font-bold mb-6">
            <span className="text-green-400">CVE</span>тлый Хакер
          </h1>

          <div className="bg-gray-900 p-6 rounded-2xl shadow-lg w-80">
            <input
              type="text"
              placeholder="Логин"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full mb-4 px-4 py-2 rounded-xl bg-black border border-gray-700 focus:ring-2 focus:ring-green-500"
            />
            <input
              type="password"
              placeholder="Пароль"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full mb-4 px-4 py-2 rounded-xl bg-black border border-gray-700 focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={isRegister ? handleRegister : handleLogin}
              className="w-full py-2 rounded-xl bg-green-600 hover:bg-green-700 transition"
            >
              {isRegister ? "Зарегистрироваться" : "Войти"}
            </button>
            <p
              className="mt-4 text-sm text-gray-400 cursor-pointer hover:text-green-400 text-center"
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация"}
            </p>
          </div>
        </div>
      ) : (
        /* ========================== MAIN TABLE VIEW ========================== */
        <div
          key={`table-${viewAnimKey}`}
          className={`flex flex-col items-center flex-1 w-full p-6 z-10 transition-all duration-500 ${
            enterVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {/* ---------- Заголовок ---------- */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-20 h-20 mb-4 rounded-full border border-green-400"
            />
            <h1 className="text-5xl font-bold">
              <span className="text-green-400">CVE</span>тлый Хакер
            </h1>
          </div>

          {/* ---------- Верхняя единая панель: вкладки | поиск | кнопки ---------- */}
          <div className="w-full max-w-[1400px] mb-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Вкладки слева */}
              <div className="flex items-center gap-2">
                {["Recent", "All", "Favorites"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 rounded-2xl transition ${
                      tab === t ? "bg-green-600" : "bg-gray-800 hover:bg-gray-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Поиск по центру */}
              <div className="flex-1 min-w-[240px] max-w-[520px]">
                <input
                  type="text"
                  placeholder="Поиск по CVE, описанию, PoC, проектам..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-4 py-2 rounded-xl bg-gray-900 text-white border border-gray-700 focus:ring-2 focus:ring-green-500 w-full"
                />
              </div>

              {/* Кнопки справа */}
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => setLang(lang === "EN" ? "RU" : "EN")}
                  className="px-4 py-2 rounded-2xl bg-green-600 hover:bg-green-700"
                >
                  {lang}
                </button>
                <button
                  onClick={fetchVulns}
                  className="px-4 py-2 rounded-2xl bg-green-600 hover:bg-green-700"
                >
                  Обновить
                </button>
                <button
                  onClick={exportCSV}
                  className="px-4 py-2 rounded-2xl bg-green-600 hover:bg-green-700"
                >
                  Экспорт CSV
                </button>
                <button
                  onClick={exportJSON}
                  className="px-4 py-2 rounded-2xl bg-green-600 hover:bg-green-700"
                >
                  Экспорт JSON
                </button>
                <a
                  href="https://t.me/CVEhaker_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold"
                >
                  БОТ
                </a>
              </div>
            </div>

            {/* Полоса прогресса перевода (при RU) */}
            {lang === "RU" && isTranslating && translationProgress > 0 && translationProgress < 100 && (
              <div className="w-full">
                <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-green-400 h-2 rounded-full transition-all"
                    style={{ width: `${translationProgress}%` }}
                  />
                </div>
                <p className="text-green-400 text-sm mt-1">{translationProgress}% переведено</p>
              </div>
            )}
          </div>

          {/* ---------- Таблица ---------- */}
          <div className="relative w-full max-w-[1400px]">
            {isLoading ? (
              <p className="text-green-400">Загрузка...</p>
            ) : filteredVulns.length === 0 ? (
              <p className="text-gray-400">Нет данных</p>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-green-600 shadow-lg bg-black">
                {/* Сам фон таблицы — полностью чёрный, чтобы матрица не просвечивала */}
                <div className="bg-black">
                  <table className="w-full border-collapse bg-black relative">
                    {/* Центрируем заголовки */}
                    <thead className="bg-green-700 text-center">
                      <tr>
                        {/* CVE */}
                        <th className="p-3 sticky top-0 z-10">CVE</th>

                        {/* Описание */}
                        <th className="p-3 sticky top-0 z-10 w-[40%]">Описание</th>

                        {/* CVSS + фильтр */}
                        <th className="p-3 sticky top-0 z-10 relative">
                          <div className="flex items-center justify-center gap-2">
                            <span>CVSS</span>
                            <FilterLabel
                              active={cvssRange[0] !== 0 || cvssRange[1] !== 10}
                              onClick={() => {
                                setShowCvssFilter((v) => !v);
                                setShowDateFilter(false);
                                setShowSeverityFilter(false);
                              }}
                            >
                              Фильтр
                            </FilterLabel>
                          </div>
                          <Popover
                            open={showCvssFilter}
                            onClose={() => setShowCvssFilter(false)}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={cvssRange[0]}
                                min={0}
                                max={10}
                                step={0.1}
                                onChange={(e) =>
                                  setCvssRange([+e.target.value, cvssRange[1]])
                                }
                                className="w-20 p-2 bg-gray-900 text-white rounded border border-gray-700"
                              />
                              <span>—</span>
                              <input
                                type="number"
                                value={cvssRange[1]}
                                min={0}
                                max={10}
                                step={0.1}
                                onChange={(e) =>
                                  setCvssRange([cvssRange[0], +e.target.value])
                                }
                                className="w-20 p-2 bg-gray-900 text-white rounded border border-gray-700"
                              />
                              <button
                                className="ml-2 px-3 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-sm"
                                onClick={() => setShowCvssFilter(false)}
                              >
                                Применить
                              </button>
                              <button
                                className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"
                                onClick={clearFilters}
                              >
                                Сбросить всё
                              </button>
                            </div>
                          </Popover>
                        </th>

                        {/* Severity + фильтр */}
                        <th className="p-3 sticky top-0 z-10 relative">
                          <div className="flex items-center justify-center gap-2">
                            <span>Severity</span>
                            <FilterLabel
                              active={severityFilter.length > 0}
                              onClick={() => {
                                setShowSeverityFilter((v) => !v);
                                setShowCvssFilter(false);
                                setShowDateFilter(false);
                              }}
                            >
                              Фильтр
                            </FilterLabel>
                          </div>
                          <Popover
                            open={showSeverityFilter}
                            onClose={() => setShowSeverityFilter(false)}
                          >
                            <div className="flex flex-col gap-1">
                              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((sev) => (
                                <label key={sev} className="text-sm flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="accent-green-600"
                                    checked={severityFilter.includes(sev)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSeverityFilter((prev) => [...prev, sev]);
                                      } else {
                                        setSeverityFilter((prev) => prev.filter((s) => s !== sev));
                                      }
                                    }}
                                  />
                                  {sev}
                                </label>
                              ))}
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  className="px-3 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-sm"
                                  onClick={() => setShowSeverityFilter(false)}
                                >
                                  Применить
                                </button>
                                <button
                                  className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"
                                  onClick={() => setSeverityFilter([])}
                                >
                                  Сбросить
                                </button>
                              </div>
                            </div>
                          </Popover>
                        </th>

                        {/* Дата + фильтр */}
                        <th className="p-3 sticky top-0 z-10 relative">
                          <div className="flex items-center justify-center gap-2">
                            <span>Дата</span>
                            <FilterLabel
                              active={dateFilter !== "all"}
                              onClick={() => {
                                setShowDateFilter((v) => !v);
                                setShowCvssFilter(false);
                                setShowSeverityFilter(false);
                              }}
                            >
                              Фильтр
                            </FilterLabel>
                          </div>
                          <Popover
                            open={showDateFilter}
                            onClose={() => setShowDateFilter(false)}
                          >
                            <div className="flex flex-col gap-1">
                              {[
                                { key: "all", label: "Все" },
                                { key: "7d", label: "За 7 дней" },
                                { key: "30d", label: "За 30 дней" },
                              ].map((opt) => (
                                <label key={opt.key} className="text-sm flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="dateFilter"
                                    className="accent-green-600"
                                    checked={dateFilter === opt.key}
                                    onChange={() => setDateFilter(opt.key)}
                                  />
                                  {opt.label}
                                </label>
                              ))}
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  className="px-3 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-sm"
                                  onClick={() => setShowDateFilter(false)}
                                >
                                  Применить
                                </button>
                                <button
                                  className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"
                                  onClick={() => setDateFilter("all")}
                                >
                                  Сбросить
                                </button>
                              </div>
                            </div>
                          </Popover>
                        </th>

                        {/* PoC */}
                        <th className="p-3 sticky top-0 z-10">PoC</th>

                        {/* Доп. опции (Проекты + Теги/Комменты/Избранное) */}
                        <th className="p-3 sticky top-0 z-10">Доп. опции</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVulns.map((v, idx) => (
                        <tr
                          key={v.cve_id}
                          className="border-t border-gray-800 hover:bg-gray-900 transition-colors"
                          style={{ animation: `fadeInUp 300ms ease ${idx * 20}ms both` }}
                        >
                          {/* CVE — ссылка на NVD */}
                          <td className="p-3 text-green-400 font-bold align-top">
                            <a
                              href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                              title="Открыть CVE на NVD"
                            >
                              {v.cve_id}
                            </a>
                          </td>

                          {/* Описание */}
                          <td className="p-3 text-sm whitespace-pre-wrap break-words align-top">
                            {lang === "RU" && translated[v.cve_id]
                              ? translated[v.cve_id]
                              : v.description || "-"}
                          </td>

                          {/* CVSS */}
                          <td className="p-3 text-center align-top">
                            {v.cvss_v3_score ?? "-"}
                          </td>

                          {/* Severity */}
                          <td className="p-3 text-center align-top">
                            {(v.cvss_v3_severity || "-").toString().toUpperCase()}
                          </td>

                          {/* Дата */}
                          <td className="p-3 text-center align-top">
                            {v.published_at
                              ? new Date(v.published_at).toLocaleDateString()
                              : "-"}
                          </td>

                          {/* PoC */}
                          <td className="p-3 text-center align-top">
                            {v.poc ? (
                              <a
                                href={v.poc}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline"
                              >
                                GitHub PoC
                              </a>
                            ) : (
                              <a
                                href={`https://github.com/search?q=${encodeURIComponent(
                                  v.cve_id + " PoC"
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-400 hover:text-green-400"
                              >
                                Найти PoC
                              </a>
                            )}
                          </td>

                          {/* Доп. опции: Проекты + Теги + Комментарии + Избранное */}
                          <td className="p-3 align-top">
                            <div className="flex flex-col gap-2">
                              {/* Кнопка Проекты */}
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() =>
                                    setProjectsModal({
                                      open: true,
                                      title: `Затронутые проекты для ${v.cve_id}`,
                                      items: Array.isArray(v.affected_projects)
                                        ? v.affected_projects
                                        : [],
                                    })
                                  }
                                  className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 border border-gray-700"
                                  title="Показать проекты"
                                >
                                  Проекты
                                </button>

                                {/* +Тег, +Комментарий, Избранное */}
                                <button
                                  onClick={() => addTag(v.cve_id)}
                                  className="px-2 py-1 text-xs rounded bg-green-700 hover:bg-green-600"
                                  title="Добавить тег"
                                >
                                  +Тег
                                </button>
                                <button
                                  onClick={() => addComment(v.cve_id)}
                                  className="px-2 py-1 text-xs rounded bg-green-700 hover:bg-green-600"
                                  title="Оставить комментарий"
                                >
                                  +Комментарий
                                </button>
                                <button
                                  onClick={() => toggleFavorite(v.cve_id)}
                                  aria-label="toggle favorite"
                                  className="ml-1"
                                  title="В избранное"
                                >
                                  <Icon.Star filled={!!favorites[v.cve_id]} />
                                </button>
                              </div>

                              {/* Текущие метки/комменты/флаг избранного */}
                              <div className="text-xs text-gray-300">
                                {(tags[v.cve_id] || []).join(", ")}
                                {comments[v.cve_id] ? ` | 💬 ${comments[v.cve_id]}` : ""}
                                {favorites[v.cve_id] ? " | ⭐ В избранном" : ""}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Модалка проектов */}
      <Modal
        open={projectsModal.open}
        title={projectsModal.title}
        onClose={() => setProjectsModal({ open: false, title: "", items: [] })}
      >
        {projectsModal.items && projectsModal.items.length ? (
          <ul className="list-disc list-inside space-y-1">
            {projectsModal.items.map((p, i) => (
              <li key={i} className="text-sm text-gray-200 break-words">{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Нет данных о затронутых проектах.</p>
        )}
      </Modal>
    </div>
  );
}

/* ###########################################################################
   #                                                                         #
   #                           ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ                    #
   #                                                                         #
   ########################################################################### */

/**
 * (Оставлен на будущее — сейчас не используется на панели, но полезен)
 * Фишка-ярлык для строки активных фильтров. Клик по ней открывал поповер.
 * Мы убрали визуальную строку фильтров по требованию, но компонент оставим.
 */
function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-xl text-sm transition ${
        active ? "bg-green-700" : "bg-gray-800 hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

/* ###########################################################################
   #                                                                         #
   #                        ЭФФЕКТ «МАТРИЦЫ» БЕЗ ИЕРОГЛИФОВ                  #
   #                                                                         #
   ########################################################################### */

/**
 * Мы строго рисуем только наш массив `words` — никаких случайных символов.
 * Цвет и альфа снижены, чтобы не мешать контенту. Частота — 75 мс.
 * На resize — пересчёт колонок.
 */
function MatrixRain() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    document.body.appendChild(canvas);
    canvas.style.position = "fixed";
    canvas.style.top = 0;
    canvas.style.left = 0;
    canvas.style.zIndex = 0;
    canvas.style.pointerEvents = "none";

    const ctx = canvas.getContext("2d");
    const fontSize = 16;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // ВСЕГДА используем только эти слова — никаких случайных иероглифов
    const words = ["CVE-2025", "PoC", "Exploit", "Patch", "Project"];
    const cols = Math.floor(width / fontSize);
    const drops = Array(cols).fill(0);

    const draw = () => {
      // лёгкая «шлейфовая» заливка, но без прозрачности в самой таблице
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0,255,0,0.4)";
      ctx.font = fontSize + "px monospace";
      for (let i = 0; i < drops.length; i++) {
        const text = words[Math.floor(Math.random() * words.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        drops[i]++;
        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }
    };

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const interval = setInterval(draw, 75);
    window.addEventListener("resize", onResize);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", onResize);
      try {
        document.body.removeChild(canvas);
      } catch {}
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ###########################################################################
   #                                                                         #
   #                             ГЛОБАЛЬНЫЕ МИКРО-СТИЛИ                      #
   #                                                                         #
   ########################################################################### */

/* Мини-анимация для появления строк таблицы */
const style = document.createElement("style");
style.innerHTML = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
document.head.appendChild(style);


