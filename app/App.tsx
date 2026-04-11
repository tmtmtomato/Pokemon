import { useState } from 'react';
import { useCalc } from './hooks/useCalc';
import { useLang } from './lib/LangContext';
import { UI } from './lib/ja';
import PokemonPanel from './components/PokemonPanel';
import MoveSelector from './components/MoveSelector';
import FieldPanel from './components/FieldPanel';
import ResultDisplay from './components/ResultDisplay';
import PartyPanel from './components/PartyPanel';

export default function App() {
  const { state, dispatch, result } = useCalc();
  const { activeTab } = state;
  const { lang, toggleLang } = useLang();
  const [showParty, setShowParty] = useState(false);

  return (
    <div className="max-w-[1400px] mx-auto px-3 pb-4">
      {/* Header */}
      <header className="py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">{UI.title[lang]}</h1>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 rounded text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
            onClick={() => setShowParty(!showParty)}
          >
            {UI.party[lang]}
          </button>
          <a
            href="./index-tracker.html"
            className="px-2 py-1 rounded text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
          >
            {lang === 'ja' ? 'トラッカー' : 'Tracker'}
          </a>
          <button
            className="px-2 py-1 rounded text-xs font-semibold border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
            onClick={toggleLang}
          >
            {lang === 'ja' ? 'EN' : 'JA'}
          </button>
        </div>
      </header>

      {/* ===== Desktop: 3-column layout (lg+) ===== */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_360px_1fr] lg:gap-4 lg:items-start">
        {/* Left: Attacker */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2">{UI.attacker[lang]}</h2>
          <PokemonPanel pokemon={state.attacker} side="attacker" dispatch={dispatch} />
        </div>

        {/* Center: Move + Result + Field */}
        <div className="space-y-3">
          <MoveSelector
            move={state.move}
            gameType={state.field.gameType}
            dispatch={dispatch}
          />
          <ResultDisplay result={result} />
          <FieldPanel field={state.field} dispatch={dispatch} />
        </div>

        {/* Right: Defender */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2">{UI.defender[lang]}</h2>
          <PokemonPanel pokemon={state.defender} side="defender" dispatch={dispatch} />
        </div>
      </div>

      {/* ===== Mobile/Tablet: single column with tabs (<lg) ===== */}
      <div className="lg:hidden">
        {/* Tab Bar */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700 mb-3">
          {(['attacker', 'defender'] as const).map(tab => (
            <button
              key={tab}
              className={`flex-1 py-2 text-sm font-semibold transition ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 text-gray-400'
              }`}
              onClick={() => dispatch({ type: 'SET_TAB', tab })}
            >
              {UI[tab][lang]}
            </button>
          ))}
        </div>

        {/* Active Pokemon Panel */}
        <PokemonPanel
          pokemon={state[activeTab]}
          side={activeTab}
          dispatch={dispatch}
        />

        {/* Move */}
        <div className="mt-3">
          <MoveSelector
            move={state.move}
            gameType={state.field.gameType}
            dispatch={dispatch}
          />
        </div>

        {/* Field */}
        <div className="mt-3">
          <FieldPanel field={state.field} dispatch={dispatch} />
        </div>

        {/* Result - sticky bottom */}
        <div className="sticky bottom-0 left-0 right-0 mt-3 -mx-3 px-3 pb-3 pt-2 bg-gray-950/95 backdrop-blur-sm border-t border-gray-800">
          <ResultDisplay result={result} />
        </div>
      </div>

      {/* Party Modal */}
      <PartyPanel open={showParty} onClose={() => setShowParty(false)} dispatch={dispatch} />
    </div>
  );
}
