/**
 * Root component for the Champions Team Analysis Viewer.
 *
 * The team analysis JSON is imported statically so that Vite bakes it
 * into the bundle that `viteSingleFile()` then inlines into the final
 * `build/teams.html`. No network fetch at runtime.
 */

import { useEffect, useMemo, useState } from "react";
import type { TeamAnalysis } from "../types/team-analysis";
import teamsJson from "../storage/analysis/_latest-teams.json";
import { TeamsToolbar, type Tab } from "./components/TeamsToolbar";
import { TeamList, type TeamSort } from "./components/TeamList";
import { TeamDetail } from "./components/TeamDetail";
import { CoreList } from "./components/CoreList";
import { CoreDetail } from "./components/CoreDetail";
import { wilsonLower } from "./utils";

const DATA: TeamAnalysis = teamsJson as unknown as TeamAnalysis;

export default function App() {
  const [tab, setTab] = useState<Tab>("teams");
  const [dark, setDark] = useState(true);

  // Team tab state
  const [teamSort, setTeamSort] = useState<TeamSort>("adjusted");
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | undefined>(
    () => DATA.teams[0]?.key,
  );

  // Core tab state
  const [selectedCoreKey, setSelectedCoreKey] = useState<string | undefined>(
    () => DATA.cores[0]?.key,
  );

  // Dark mode
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      document.body.classList.add("bg-gray-950", "text-gray-100");
      document.body.classList.remove("bg-gray-100", "text-gray-900");
    } else {
      root.classList.remove("dark");
      document.body.classList.remove("bg-gray-950", "text-gray-100");
      document.body.classList.add("bg-gray-100", "text-gray-900");
    }
  }, [dark]);

  const sortedTeams = useMemo(() => {
    if (teamSort === "winRate") {
      return [...DATA.teams].sort((a, b) => b.winRate - a.winRate || b.count - a.count);
    }
    if (teamSort === "adjusted") {
      return [...DATA.teams].sort((a, b) => {
        const wa = wilsonLower(a.wins, a.count);
        const wb = wilsonLower(b.wins, b.count);
        return wb - wa || b.count - a.count;
      });
    }
    return DATA.teams; // already sorted by count
  }, [teamSort]);

  const selectedTeam = useMemo(
    () => DATA.teams.find((t) => t.key === selectedTeamKey),
    [selectedTeamKey],
  );

  const selectedCore = useMemo(
    () => DATA.cores.find((c) => c.key === selectedCoreKey),
    [selectedCoreKey],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TeamsToolbar
        tab={tab}
        onTabChange={setTab}
        dark={dark}
        onToggleDark={() => setDark((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        {tab === "teams" ? (
          <>
            <aside className="viewer-scroll flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-gray-950">
              <div className="border-b border-gray-800 bg-gray-900/60 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400">
                {DATA.teams.length} teams · {DATA.totalReplays} replays
              </div>
              <TeamList
                teams={sortedTeams}
                selected={selectedTeamKey}
                onSelect={setSelectedTeamKey}
                sort={teamSort}
                onSortChange={setTeamSort}
              />
            </aside>
            <main className="viewer-scroll flex-1 overflow-y-auto bg-gray-950">
              <TeamDetail team={selectedTeam} />
            </main>
          </>
        ) : (
          <>
            <aside className="viewer-scroll flex w-96 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-gray-950">
              <div className="border-b border-gray-800 bg-gray-900/60 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400">
                {DATA.cores.length} cores · {DATA.totalReplays} replays
              </div>
              <CoreList
                cores={DATA.cores}
                selected={selectedCoreKey}
                onSelect={setSelectedCoreKey}
              />
            </aside>
            <main className="viewer-scroll flex-1 overflow-y-auto bg-gray-950">
              <CoreDetail core={selectedCore} />
            </main>
          </>
        )}
      </div>

      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 text-[11px] text-gray-500">
        Generated at {DATA.generatedAt} · {DATA.totalReplays} replays ·{" "}
        {DATA.teams.length} teams · {DATA.cores.length} cores · Data: vgcpast.es
      </footer>
    </div>
  );
}
