/**
 * React hook for running inference on recorded turns.
 * Runs inference synchronously for now (fast enough for Mode A ~37K combos).
 * TODO: Move to Web Worker for Mode B (~1M combos) if performance is an issue.
 */
import { useMemo } from 'react';
import type { TrackerState } from './useTracker';
import type { TurnInference, SlotInference } from '../engine/inference-types';
import { inferTurn } from '../engine/inference';
import { aggregateSlotInference } from '../engine/candidate-filter';
import { getSpecies } from '../../src/data/index.js';

export interface InferenceResults {
  /** Per-turn inference results */
  perTurn: TurnInference[];
  /** Aggregated per-slot results */
  perSlot: Map<number, SlotInference>;
  /** Whether inference is running */
  isLoading: boolean;
}

/**
 * Compute inference results for all recorded turns.
 * Memoized to avoid recalculating unless turns/teams change.
 */
export function useInference(state: TrackerState): InferenceResults {
  const { turns, myTeam, opponentTeam } = state;

  const results = useMemo(() => {
    if (turns.length === 0) {
      return { perTurn: [], perSlot: new Map<number, SlotInference>() };
    }

    // Run inference per turn
    const perTurn: TurnInference[] = [];
    for (const turn of turns) {
      // Validate that the referenced slots exist and have species
      const attackerTeam = turn.attackerSide === 'mine' ? myTeam : opponentTeam;
      const defenderTeam = turn.attackerSide === 'mine' ? opponentTeam : myTeam;
      if (!attackerTeam[turn.attackerSlot]?.species || !defenderTeam[turn.defenderSlot]?.species) {
        continue;
      }
      try {
        const inf = inferTurn(turn, myTeam, opponentTeam);
        perTurn.push(inf);
      } catch (e) {
        // M-8: Log inference errors for debugging
        console.warn(`[useInference] Turn ${turn.turnNumber} inference failed:`, e);
      }
    }

    // Group by opponent slot
    const bySlot = new Map<number, TurnInference[]>();
    for (const inf of perTurn) {
      const existing = bySlot.get(inf.opponentSlot) ?? [];
      existing.push(inf);
      bySlot.set(inf.opponentSlot, existing);
    }

    // Aggregate per slot (with base stats for prior weighting)
    const perSlot = new Map<number, SlotInference>();
    for (const [slot, inferences] of bySlot) {
      const oppSpecies = opponentTeam[slot]?.species;
      const speciesData = oppSpecies ? getSpecies(oppSpecies) : undefined;
      const baseStats = speciesData?.baseStats;
      perSlot.set(slot, aggregateSlotInference(inferences, baseStats, slot));
    }

    return { perTurn, perSlot };
  }, [turns, myTeam, opponentTeam]);

  return {
    ...results,
    isLoading: false,
  };
}
