/**
 * @fileoverview Top-level app. Owns the links list and every filter/sort/
 * pagination param, and re-fetches from the API whenever one of them
 * changes. Deliberately a single component rather than split into a
 * "page" — the whole app is one screen for now (Phase 1 has no routing to
 * speak of; that changes once Phase 2 adds a login screen).
 * @author Mohit Sharma
 */

import { useCallback, useEffect, useState } from "react";
import { listLinks } from "./api/links.js";
import { pushToast } from "./hooks/useToasts.js";
import { useDebouncedValue } from "./hooks/useDebouncedValue.js";
import { Header } from "./components/Header.jsx";
import { ShortenForm } from "./components/ShortenForm.jsx";
import { ResultCard } from "./components/ResultCard.jsx";
import { LinkFilters } from "./components/LinkFilters.jsx";
import { LinksTable } from "./components/LinksTable.jsx";
import { Pagination } from "./components/Pagination.jsx";
import { ToastStack } from "./components/ToastStack.jsx";

const PAGE_SIZE = 10;

/**
 * @returns {JSX.Element}
 */
export default function App() {
  const [links, setLinks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasNext: false, hasPrev: false });
  const [loading, setLoading] = useState(true);
  const [lastCreated, setLastCreated] = useState(null);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt:desc");
  const [isActive, setIsActive] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listLinks({
        page,
        limit: PAGE_SIZE,
        sort,
        isActive: isActive || undefined,
        search: debouncedSearch || undefined,
      });
      setLinks(result.data);
      setPagination(result.pagination);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [page, sort, isActive, debouncedSearch]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Any filter change should reset back to page 1 — staying on page 4 of a
  // now-3-page result set would just show an empty table.
  useEffect(() => {
    setPage(1);
  }, [sort, isActive, debouncedSearch]);

  function handleCreated(link) {
    setLastCreated(link);
    if (page === 1 && sort === "createdAt:desc" && !isActive && !debouncedSearch) {
      refetch();
    }
  }

  function handleUpdated(updated) {
    setLinks((current) => current.map((l) => (l.id === updated.id ? updated : l)));
  }

  function handleDeleted(id) {
    setLinks((current) => current.filter((l) => l.id !== id));
    setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) }));
  }

  return (
    <div className="app">
      <Header />

      <main className="app__main">
        <section className="hero">
          <h1 className="hero__title">Shorten a long URL</h1>
          <p className="hero__subtitle">A test harness for the URL Shortener API — every request here hits the real backend.</p>
          <ShortenForm onCreated={handleCreated} />
          {lastCreated && <ResultCard link={lastCreated} onDismiss={() => setLastCreated(null)} />}
        </section>

        <section className="links-section">
          <div className="links-section__header">
            <h2>Your links</h2>
            <LinkFilters
              search={search}
              onSearchChange={setSearch}
              isActive={isActive}
              onIsActiveChange={setIsActive}
              sort={sort}
              onSortChange={setSort}
            />
          </div>

          <LinksTable links={links} loading={loading} onUpdated={handleUpdated} onDeleted={handleDeleted} />

          {!loading && links.length > 0 && <Pagination pagination={pagination} onPageChange={setPage} />}
        </section>
      </main>

      <ToastStack />
    </div>
  );
}
