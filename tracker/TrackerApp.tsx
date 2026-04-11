import { useLang } from '../app/lib/LangContext';
import { useTracker } from './hooks/useTracker';
import type { TrackerPhase } from './hooks/useTracker';
import { useInference } from './hooks/useInference';
import TeamSetup from './components/TeamSetup';
import BattleLog from './components/BattleLog';
import InferencePanel from './components/InferencePanel';

const PHASE_LABELS: Record<TrackerPhase, { ja: string; en: string }> = {
  setup: { ja: 'チーム設定', en: 'Team Setup' },
  battle: { ja: 'バトル', en: 'Battle' },
  review: { ja: '分析', en: 'Review' },
};

export default function TrackerApp() {
  const { state, dispatch } = useTracker();
  const inference = useInference(state);
  const { phase } = state;
  const { lang, toggleLang } = useLang();

  return (
    <div className="max-w-2xl mx-auto px-3 pb-4">
      {/* Header */}
      <header className="py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">
          {lang === 'ja' ? 'Champions バトルトラッカー' : 'Champions Battle Tracker'}
        </h1>
        <div className="flex gap-2">
          <a
            href="./index.html"
            className="px-2 py-1 rounded text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
          >
            {lang === 'ja' ? '計算機' : 'Calc'}
          </a>
          <button
            className="px-2 py-1 rounded text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
            onClick={toggleLang}
          >
            {lang === 'ja' ? 'EN' : 'JA'}
          </button>
        </div>
      </header>

      {/* Phase tabs */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700 mb-3">
        {(['setup', 'battle', 'review'] as const).map(p => (
          <button
            key={p}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              phase === p
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-400'
            }`}
            onClick={() => dispatch({ type: 'SET_PHASE', phase: p })}
          >
            {PHASE_LABELS[p][lang]}
          </button>
        ))}
      </div>

      {/* Phase content */}
      {phase === 'setup' && (
        <TeamSetup
          myTeam={state.myTeam}
          opponentTeam={state.opponentTeam}
          dispatch={dispatch}
          onStart={() => dispatch({ type: 'SET_PHASE', phase: 'battle' })}
        />
      )}
      {phase === 'battle' && (
        <div className="space-y-3">
          <BattleLog state={state} dispatch={dispatch} />
          {state.turns.length > 0 && (
            <InferencePanel state={state} inference={inference} />
          )}
        </div>
      )}
      {phase === 'review' && (
        <InferencePanel state={state} inference={inference} />
      )}
    </div>
  );
}
