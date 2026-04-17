import type { PoolMember } from "../../types/team-matchup";
import type { Lang } from "../../viewer/i18n";
import { localizePokemon, localizeType, localizeMove, localizeNature } from "../../viewer/i18n";
import type { RoleClassification } from "../builderCalc";
import { getRoleLabel } from "../builderCalc";

function formatSP(sp: PoolMember["sp"]): string {
  return `${sp.hp}-${sp.atk}-${sp.def}-${sp.spa}-${sp.spd}-${sp.spe}`;
}

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-400", Grass: "bg-green-500", Ice: "bg-cyan-300",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-600",
  Flying: "bg-indigo-300", Psychic: "bg-pink-500", Bug: "bg-lime-500",
  Rock: "bg-yellow-700", Ghost: "bg-purple-800", Dragon: "bg-indigo-600",
  Dark: "bg-gray-800", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

interface Props {
  team: string[];
  activeSlot: number;
  expandedMember: string | null;
  poolByName: Map<string, PoolMember>;
  memberRoles: Map<string, RoleClassification>;
  lang: Lang;
  onSlotClick: (index: number) => void;
  onRemove: (index: number) => void;
}

export function TeamSlots({
  team, activeSlot, expandedMember,
  poolByName, memberRoles, lang,
  onSlotClick, onRemove,
}: Props) {
  const slots = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
        {lang === "ja" ? "チーム" : "Team"}
      </div>
      {slots.map((i) => {
        const name = team[i];
        const member = name ? poolByName.get(name) : null;
        const role = name ? memberRoles.get(name) : null;
        const isActive = i === activeSlot && !name;
        const isExpanded = name === expandedMember;

        if (!name || !member) {
          return (
            <button
              key={i}
              onClick={() => onSlotClick(i)}
              className={`rounded border-2 border-dashed p-3 text-center text-sm transition-colors
                ${isActive ? "border-blue-500 bg-blue-950/30 text-blue-400" : "border-gray-600 text-gray-500 hover:border-gray-500"}`}
            >
              {lang === "ja" ? `${i + 1}体目を選択` : `Pick #${i + 1}`}
            </button>
          );
        }

        return (
          <div
            key={i}
            onClick={() => onSlotClick(i)}
            className={`group relative cursor-pointer rounded border p-2 transition-colors
              ${isExpanded ? "border-yellow-500 bg-yellow-950/20" : "border-gray-600 hover:border-gray-400"}`}
          >
            {/* Remove button */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              className="absolute top-1 right-1 hidden rounded bg-red-800 px-1.5 text-xs leading-tight text-red-200 group-hover:block hover:bg-red-700"
              title="Remove"
            >
              ×
            </button>

            {/* Name + types */}
            <div className="font-semibold text-sm leading-tight">
              {localizePokemon(name, lang)}
            </div>
            <div className="flex gap-1 mt-1">
              {member.types.map((t) => (
                <span
                  key={t}
                  className={`${TYPE_COLORS[t] ?? "bg-gray-600"} rounded px-1 text-[10px] text-white leading-tight`}
                >
                  {localizeType(t, lang)}
                </span>
              ))}
              {member.isMega && (
                <span className="rounded bg-gradient-to-r from-purple-600 to-pink-600 px-1 text-[10px] text-white leading-tight">
                  Mega
                </span>
              )}
            </div>

            {/* Nature + SP */}
            <div className="mt-1 text-[10px] text-gray-400">
              {localizeNature(member.nature, lang)} / {member.item}
            </div>
            <div className="text-[10px] font-mono text-gray-500">
              {formatSP(member.sp)}
            </div>

            {/* Moves */}
            <div className="mt-0.5 text-[9px] text-gray-500 leading-tight">
              {member.moves.map((m) => localizeMove(m, lang)).join(" / ")}
            </div>

            {/* Role badge */}
            {role && (
              <div className="mt-0.5 text-[10px] text-gray-400">
                {getRoleLabel(role.primary)}
                {role.secondary.length > 0 && ` / ${getRoleLabel(role.secondary[0])}`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
