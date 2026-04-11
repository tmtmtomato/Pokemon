import type { TrackerAction, MyPokemonSlot, OpponentPokemonSlot } from '../hooks/useTracker';
import { useLang } from '../../app/lib/LangContext';
import MySlotCard from './MySlotCard';
import OpponentSlotCard from './OpponentSlotCard';
import TeamLibrary from './TeamLibrary';

interface TeamSetupProps {
  myTeam: MyPokemonSlot[];
  opponentTeam: OpponentPokemonSlot[];
  dispatch: React.Dispatch<TrackerAction>;
  onStart: () => void;
}

export default function TeamSetup({ myTeam, opponentTeam, dispatch, onStart }: TeamSetupProps) {
  const { lang } = useLang();

  const canStart = myTeam.some(s => s.species) && opponentTeam.some(s => s.species);

  return (
    <div className="space-y-4">
      {/* Team Library (import/export/save/load) */}
      <TeamLibrary currentTeam={myTeam} dispatch={dispatch} />

      {/* My Team */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-blue-400">
            {lang === 'ja' ? '自分のチーム' : 'My Team'}
          </h2>
          {myTeam.length < 6 && (
            <button
              className="text-xs text-gray-400 hover:text-white transition"
              onClick={() => dispatch({ type: 'ADD_MY_SLOT' })}
            >
              + {lang === 'ja' ? '追加' : 'Add'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {myTeam.map((slot, i) => (
            <MySlotCard
              key={`my-${i}-${slot.species}`}
              slot={slot}
              index={i}
              canRemove={myTeam.length > 1}
              dispatch={dispatch}
            />
          ))}
        </div>
      </section>

      {/* Opponent Team */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-red-400">
            {lang === 'ja' ? '相手のチーム' : "Opponent's Team"}
          </h2>
          {opponentTeam.length < 6 && (
            <button
              className="text-xs text-gray-400 hover:text-white transition"
              onClick={() => dispatch({ type: 'ADD_OPPONENT_SLOT' })}
            >
              + {lang === 'ja' ? '追加' : 'Add'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {opponentTeam.map((slot, i) => (
            <OpponentSlotCard
              key={`opp-${i}-${slot.species}`}
              slot={slot}
              index={i}
              canRemove={opponentTeam.length > 1}
              dispatch={dispatch}
            />
          ))}
        </div>
      </section>

      {/* Start Button */}
      <button
        className={`w-full py-3 rounded-lg font-semibold text-sm transition ${
          canStart
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
        disabled={!canStart}
        onClick={onStart}
      >
        {lang === 'ja' ? 'バトル開始' : 'Start Battle'}
      </button>
    </div>
  );
}
