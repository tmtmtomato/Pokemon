import type { TrackerAction, TrackerState } from '../hooks/useTracker';
import { useLang } from '../../app/lib/LangContext';
import TurnEntry from './TurnEntry';
import TurnCard from './TurnCard';

interface Props {
  state: TrackerState;
  dispatch: React.Dispatch<TrackerAction>;
}

export default function BattleLog({ state, dispatch }: Props) {
  const { lang } = useLang();

  return (
    <div className="space-y-3">
      {/* Turn entry form */}
      <TurnEntry
        myTeam={state.myTeam}
        opponentTeam={state.opponentTeam}
        currentField={state.currentField}
        dispatch={dispatch}
      />

      {/* Recorded turns */}
      {state.turns.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 mb-2">
            {lang === 'ja' ? `記録済み (${state.turns.length}ターン)` : `Recorded (${state.turns.length} turns)`}
          </h3>
          <div className="space-y-1">
            {state.turns.map(turn => (
              <TurnCard
                key={turn.id}
                turn={turn}
                myTeam={state.myTeam}
                opponentTeam={state.opponentTeam}
                onDelete={() => dispatch({ type: 'DELETE_TURN', id: turn.id })}
              />
            ))}
          </div>
        </section>
      )}

      {state.turns.length === 0 && (
        <div className="text-center text-gray-600 text-xs py-4">
          {lang === 'ja' ? 'ターンを記録してください' : 'Record turns above'}
        </div>
      )}
    </div>
  );
}
