import { useState, useEffect } from 'react';
import { pokemonArtwork } from '../lib/sprites';
import { TYPE_COLORS } from '../lib/constants';

interface PokemonSpriteProps {
  id: number | undefined;
  name: string;
  isMega?: boolean;
  isTera?: boolean;
  teraType?: string;
}

export default function PokemonSprite({ id, name, isMega, isTera, teraType }: PokemonSpriteProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Reset load state when Pokemon changes
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [id]);

  if (!id) {
    return (
      <div className="w-28 h-28 mx-auto flex items-center justify-center text-gray-600">
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
          <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      </div>
    );
  }

  const src = pokemonArtwork(id);
  const teraColor = teraType ? (TYPE_COLORS[teraType] ?? '#44AABB') : undefined;

  return (
    <div className="relative w-28 h-28 mx-auto">
      {/* Loading skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 rounded-full bg-gray-800 animate-pulse" />
      )}

      {/* Tera glow effect */}
      {isTera && teraColor && (
        <div
          className="absolute inset-2 rounded-full opacity-25 blur-lg"
          style={{ backgroundColor: teraColor }}
        />
      )}

      {!error ? (
        <img
          src={src}
          alt={name}
          className={`w-full h-full object-contain drop-shadow-lg transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="eager"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
          {name}
        </div>
      )}

      {/* Mega badge */}
      {isMega && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          MEGA
        </span>
      )}
    </div>
  );
}
