import React from "react";
import type { PoolMember, RankedTeam } from "../../types/team-matchup";
import { localizePokemon, comparePokemonName, type Lang } from "../../viewer/i18n";

interface Props {
  opponents: (PoolMember | null)[];
  onSetOpponents: (opps: (PoolMember | null)[]) => void;
  pool: PoolMember[];
  topTeams: RankedTeam[];
  lang: Lang;
}

export default function OpponentSelector({
  opponents,
  onSetOpponents,
  pool,
  topTeams,
  lang,
}: Props) {
  const poolByName = new Map(pool.map((p) => [p.name, p]));

  function setSlot(index: number, name: string) {
    const next = [...opponents];
    next[index] = name ? poolByName.get(name) ?? null : null;
    onSetOpponents(next);
  }

  function loadTeam(teamId: string) {
    const team = topTeams.find((t) => t.teamId === teamId);
    if (!team) return;
    const next: (PoolMember | null)[] = team.members.map((name) => poolByName.get(name) ?? null);
    onSetOpponents(next);
  }

  function clearAll() {
    onSetOpponents([null, null, null, null, null, null]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">
          {lang === "ja" ? "相手チーム" : "Opponent Team"}
        </span>

        <select
          className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 border border-gray-700 focus:ring-1 focus:ring-blue-500"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) loadTeam(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">
            {lang === "ja" ? "Top50チームから読込..." : "Load from Top 50..."}
          </option>
          {topTeams.slice(0, 50).map((t) => (
            <option key={t.teamId} value={t.teamId}>
              #{t.rank} ({(t.winRate * 100).toFixed(1)}%) {t.members.slice(0, 3).join("/")}...
            </option>
          ))}
        </select>

        <button
          onClick={clearAll}
          className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700"
        >
          {lang === "ja" ? "クリア" : "Clear"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <select
            key={i}
            value={opponents[i]?.name ?? ""}
            onChange={(e) => setSlot(i, e.target.value)}
            className="rounded bg-gray-800 px-1.5 py-1 text-xs text-gray-300 border border-gray-700 truncate focus:ring-1 focus:ring-blue-500"
          >
            <option value="">
              {lang === "ja" ? `スロット${i + 1}` : `Slot ${i + 1}`}
            </option>
            {[...pool].sort((a, b) => comparePokemonName(a.name, b.name, lang)).map((p) => (
              <option key={p.name} value={p.name}>
                {localizePokemon(p.name, lang)}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
