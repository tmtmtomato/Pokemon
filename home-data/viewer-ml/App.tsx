/**
 * Root component for the Champions ML Insights Viewer.
 *
 * Loads team-eval, selection, and move-advisor model JSONs statically.
 * Vite + viteSingleFile() bakes everything into build/ml.html.
 */

import { useEffect, useState } from "react";
import type { TeamEvalModel, SelectionModel, MoveAdvisorModel } from "../types/ml-viewer";
import { MLToolbar } from "./components/MLToolbar";
import { TeamRankings } from "./components/TeamRankings";
import { MoveQuality } from "./components/MoveQuality";
import { BadPlays } from "./components/BadPlays";
import { ModelAnalysis } from "./components/ModelAnalysis";
import type { Tab } from "./utils";

import teamEvalJson from "../storage/ml/team-eval-model.json";
import selectionJson from "../storage/ml/selection-model.json";
import moveAdvisorJson from "../storage/ml/move-advisor-model.json";

const TEAM_EVAL: TeamEvalModel = teamEvalJson as unknown as TeamEvalModel;
const SELECTION: SelectionModel = selectionJson as unknown as SelectionModel;
const MOVE_ADVISOR: MoveAdvisorModel = moveAdvisorJson as unknown as MoveAdvisorModel;

export default function App() {
  const [tab, setTab] = useState<Tab>("teams");
  const [dark, setDark] = useState(true);

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

  return (
    <div className="flex min-h-screen flex-col">
      <MLToolbar
        tab={tab}
        onTabChange={setTab}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
      />

      <main className="viewer-scroll flex-1 overflow-y-auto bg-gray-950 p-4">
        {tab === "teams" && (
          <TeamRankings rankings={TEAM_EVAL.teamRankings} />
        )}
        {tab === "moves" && (
          <MoveQuality data={MOVE_ADVISOR.speciesMoveQuality} />
        )}
        {tab === "badplays" && (
          <BadPlays data={MOVE_ADVISOR.commonBadPlays} totalReplays={MOVE_ADVISOR.totalReplays} />
        )}
        {tab === "models" && (
          <ModelAnalysis
            teamEval={TEAM_EVAL}
            selection={SELECTION}
            moveAdvisor={MOVE_ADVISOR}
          />
        )}
      </main>

      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 text-[11px] text-gray-500">
        Generated: {TEAM_EVAL.generatedAt.slice(0, 10)} · {(MOVE_ADVISOR.totalReplays ?? 0).toLocaleString()} replays · 3 GBDT models
      </footer>
    </div>
  );
}
