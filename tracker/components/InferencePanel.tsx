import type { TrackerState } from '../hooks/useTracker';
import type { InferenceResults } from '../hooks/useInference';
import { useLang } from '../../app/lib/LangContext';
import OpponentCard from './OpponentCard';

interface Props {
  state: TrackerState;
  inference: InferenceResults;
}

export default function InferencePanel({ state, inference }: Props) {
  const { lang } = useLang();

  const activeOpponents = state.opponentTeam.filter(s => s.species);

  if (activeOpponents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400">
        {lang === 'ja' ? '相手の型推定' : 'Opponent Build Inference'}
      </h3>
      {state.opponentTeam.map((slot, i) => {
        if (!slot.species) return null;
        return (
          <OpponentCard
            key={`inf-${i}-${slot.species}`}
            slot={slot}
            inference={inference.perSlot.get(i)}
          />
        );
      })}
    </div>
  );
}
