import { useState, useMemo, useCallback } from "react";
import matchupJson from "../storage/analysis/_latest-team-matchup.json";
import spGridJson from "../storage/analysis/_latest-sp-grid.json";
import type { TeamMatchupResult, PoolMember, DamageMatrix } from "../types/team-matchup";
import type { SPGridData } from "./spAnalysisCalc";
import { useLang } from "../viewer/LanguageContext";
import { localizePokemon } from "../viewer/i18n";
import { baseSpecies, MEGA_POOL_SUFFIX } from "../analyzer/team-matchup-core";
import {
  classifyRole,
  computeToughOpponents,
  computeComplementScores,
  computeMatchupDetails,
  computeTeamSummary,
  isValidCandidate,
  type TeamConstraints,
} from "./builderCalc";
import { BuilderToolbar } from "./components/BuilderToolbar";
import { TeamSlots } from "./components/TeamSlots";
import { PoolBrowser } from "./components/PoolBrowser";
import { PokemonRoleCard } from "./components/PokemonRoleCard";
import { GapAnalysis } from "./components/GapAnalysis";
import { ComplementPanel } from "./components/ComplementPanel";
import { TeamSummary } from "./components/TeamSummary";

const data = matchupJson as unknown as TeamMatchupResult;
const spGrid = (spGridJson as unknown as SPGridData)?.attackerGrid
  ? (spGridJson as unknown as SPGridData) : undefined;

/** Build poolSpeeds map from pool data */
function buildPoolSpeeds(pool: PoolMember[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pool) m.set(p.name, p.speedStat ?? 0);
  return m;
}

export default function App() {
  const { lang, toggleLang } = useLang();
  const [dark, setDark] = useState(true);
  const [team, setTeam] = useState<string[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);

  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  // ── Derived data ──────────────────────────────────────────

  const pool = data.pool;
  const matrix = data.damageMatrix;
  const poolSpeeds = useMemo(() => buildPoolSpeeds(pool), [pool]);

  const poolByName = useMemo(() => {
    const m = new Map<string, PoolMember>();
    for (const p of pool) m.set(p.name, p);
    return m;
  }, [pool]);

  const megaCapable = useMemo(
    () => new Set(pool.filter((p) => p.isMega).map((p) => p.name)),
    [pool],
  );

  // ── Team constraints ──────────────────────────────────────

  const constraints = useMemo<TeamConstraints>(() => {
    const teamBaseSpecies = new Set(team.map((n) => baseSpecies(n)));
    const teamItems = new Set(
      team.map((n) => poolByName.get(n)?.item ?? "").filter(Boolean),
    );
    const teamMegaCount = team.filter((n) => megaCapable.has(n)).length;
    return { megaCapable, teamMegaCount, teamBaseSpecies, teamItems };
  }, [team, poolByName, megaCapable]);

  // ── Calculations ──────────────────────────────────────────

  const memberRoles = useMemo(
    () =>
      new Map(
        team.map((name) => [
          name,
          classifyRole(name, poolByName.get(name)!, pool, matrix, poolSpeeds),
        ]),
      ),
    [team, poolByName, pool, matrix, poolSpeeds],
  );

  const toughOpponents = useMemo(
    () => computeToughOpponents(team, pool, matrix, poolSpeeds),
    [team, pool, matrix, poolSpeeds],
  );

  const complementScores = useMemo(
    () =>
      team.length > 0
        ? computeComplementScores(
            team,
            toughOpponents,
            pool,
            matrix,
            poolSpeeds,
            data.topCores,
            data.pokemonCoreStats,
            constraints,
          )
        : [],
    [team, toughOpponents, pool, matrix, poolSpeeds, constraints],
  );

  const teamSummary = useMemo(
    () => (team.length > 0 ? computeTeamSummary(team, pool, matrix, poolSpeeds) : null),
    [team, pool, matrix, poolSpeeds],
  );

  // ── Available pool (filtered) ─────────────────────────────

  const availablePool = useMemo(() => {
    let list = pool.filter((p) => !team.includes(p.name) && isValidCandidate(p, constraints));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => {
        const en = p.name.toLowerCase();
        const ja = localizePokemon(p.name, "ja").toLowerCase();
        return en.includes(q) || ja.includes(q);
      });
    }
    if (filterType) {
      list = list.filter((p) => p.types.includes(filterType));
    }
    return list;
  }, [pool, team, constraints, query, filterType]);

  // ── Complement score map for PoolBrowser ──────────────────

  const complementMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of complementScores) m.set(s.name, s.totalScore);
    return m;
  }, [complementScores]);

  // ── Handlers ──────────────────────────────────────────────

  const handleSelect = useCallback(
    (name: string) => {
      setTeam((prev) => {
        if (prev.length >= 6 || prev.includes(name)) return prev;
        const next = [...prev];
        // Place into activeSlot or first empty position
        if (activeSlot < 6 && !next[activeSlot]) {
          next[activeSlot] = name;
        } else {
          next.push(name);
        }
        return next;
      });
      setExpandedMember(null);
      // Advance activeSlot
      setActiveSlot((prev) => {
        for (let i = prev + 1; i < 6; i++) {
          if (!team[i]) return i;
        }
        for (let i = 0; i < prev; i++) {
          if (!team[i]) return i;
        }
        return -1; // all filled
      });
    },
    [activeSlot, team],
  );

  const handleRemove = useCallback(
    (index: number) => {
      setTeam((prev) => prev.filter((_, i) => i !== index));
      setActiveSlot(index);
      setExpandedMember(null);
    },
    [],
  );

  const handleSlotClick = useCallback(
    (index: number) => {
      if (index < team.length) {
        // Existing member — toggle expanded
        const name = team[index];
        setExpandedMember((prev) => (prev === name ? null : name));
      } else {
        setActiveSlot(index);
        setExpandedMember(null);
      }
    },
    [team],
  );

  const handleClearAll = useCallback(() => {
    setTeam([]);
    setActiveSlot(0);
    setExpandedMember(null);
    setQuery("");
  }, []);

  // ── Center panel mode ─────────────────────────────────────

  const isSelecting = team.length < 6 && expandedMember === null;
  const showSummary = team.length === 6 && expandedMember === null;

  // ── Expanded member matchup details ───────────────────────

  const expandedDetails = useMemo(
    () =>
      expandedMember
        ? computeMatchupDetails(expandedMember, pool, matrix, poolSpeeds)
        : [],
    [expandedMember, pool, matrix, poolSpeeds],
  );

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col">
      <BuilderToolbar
        query={query}
        onQueryChange={setQuery}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        lang={lang}
        onToggleLang={toggleLang}
        dark={dark}
        onToggleDark={toggleDark}
        teamSize={team.length}
        onClearAll={handleClearAll}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Team Slots */}
        <aside className="viewer-scroll w-64 shrink-0 overflow-y-auto border-r border-gray-700 p-2">
          <TeamSlots
            team={team}
            activeSlot={activeSlot}
            expandedMember={expandedMember}
            poolByName={poolByName}
            memberRoles={memberRoles}
            lang={lang}
            onSlotClick={handleSlotClick}
            onRemove={handleRemove}
          />
        </aside>

        {/* Center */}
        <main className="viewer-scroll flex-1 overflow-y-auto p-4">
          {isSelecting && (
            <PoolBrowser
              pool={availablePool}
              complementMap={complementMap}
              poolByName={poolByName}
              poolSpeeds={poolSpeeds}
              matrix={matrix}
              lang={lang}
              teamSize={team.length}
              onSelect={handleSelect}
            />
          )}
          {expandedMember && (
            <PokemonRoleCard
              name={expandedMember}
              member={poolByName.get(expandedMember)!}
              role={memberRoles.get(expandedMember)!}
              matchups={expandedDetails}
              pool={pool}
              matrix={matrix}
              poolSpeeds={poolSpeeds}
              spGrid={spGrid}
              lang={lang}
            />
          )}
          {showSummary && (
            <TeamSummary
              team={team}
              poolByName={poolByName}
              memberRoles={memberRoles}
              summary={teamSummary!}
              toughOpponents={toughOpponents}
              lang={lang}
            />
          )}
        </main>

        {/* Right: Gaps + Suggestions */}
        <aside className="viewer-scroll w-72 shrink-0 overflow-y-auto border-l border-gray-700 p-2">
          <GapAnalysis
            toughOpponents={toughOpponents}
            poolByName={poolByName}
            team={team}
            totalPool={pool.length}
            lang={lang}
          />
          {team.length > 0 && team.length < 6 && (
            <ComplementPanel
              suggestions={complementScores.slice(0, 10)}
              lang={lang}
              onSelect={handleSelect}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
