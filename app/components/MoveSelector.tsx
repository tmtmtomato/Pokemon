import type { MoveFormState, CalcAction } from '../hooks/useCalc';
import type { GameType } from '../../src/types.js';
import { getAllMoveNames, getMove } from '../../src/data/index.js';
import { TYPE_COLORS } from '../lib/constants';
import { MOVE_JA, TYPE_JA, CATEGORY_JA, CATEGORY_EN, UI, t } from '../lib/ja';
import { useLang } from '../lib/LangContext';
import SearchSelect from './SearchSelect';
import { categoryIcon } from '../lib/sprites';

interface MoveSelectorProps {
  move: MoveFormState;
  gameType: GameType;
  dispatch: React.Dispatch<CalcAction>;
}

const allMoves = getAllMoveNames();

export default function MoveSelector({ move, gameType, dispatch }: MoveSelectorProps) {
  const { lang } = useLang();
  const moveData = move.name ? getMove(move.name) : null;
  const catMap = lang === 'ja' ? CATEGORY_JA : CATEGORY_EN;

  return (
    <div className="space-y-2">
      <SearchSelect
        label={UI.move[lang]}
        options={allMoves}
        value={move.name}
        onChange={v => dispatch({ type: 'SET_MOVE', name: v })}
        displayMap={MOVE_JA}
      />

      {moveData && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-2 py-0.5 rounded text-xs font-semibold text-white"
            style={{ backgroundColor: TYPE_COLORS[moveData.type] }}
          >
            {t(moveData.type, TYPE_JA, lang)}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <img
              src={categoryIcon(moveData.category)}
              alt={moveData.category}
              className="h-3.5 inline-block"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {catMap[moveData.category] ?? moveData.category} · {UI.power[lang]} {moveData.basePower}
          </span>

          <button
            className={`px-2 py-1 rounded text-xs transition ${
              move.isCrit ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            onClick={() => dispatch({ type: 'SET_CRIT', isCrit: !move.isCrit })}
          >
            {UI.crit[lang]}
          </button>

          {gameType === 'Doubles' && (moveData as any).isSpread && (
            <button
              className={`px-2 py-1 rounded text-xs transition ${
                move.isSpread ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              onClick={() => dispatch({ type: 'SET_SPREAD', isSpread: !move.isSpread })}
            >
              {UI.spread[lang]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
