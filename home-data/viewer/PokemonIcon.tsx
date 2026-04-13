/** Shared Pokemon menu sprite icon for all home-data viewers */
import { MENU_SPRITE_MAP } from "../../app/lib/menu-sprite-map";

function spritePath(name: string, isMega: boolean): string {
  const key = isMega ? `${name}-Mega` : name;
  const file = MENU_SPRITE_MAP[key];
  return file ? `./sprites/pokemon/menu/${file}` : "";
}

export function PokemonIcon({
  name,
  isMega = false,
  size = "w-7 h-7",
}: {
  name: string;
  isMega?: boolean;
  size?: string;
}) {
  const src = spritePath(name, isMega);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className={`inline-block ${size} object-contain align-middle`}
      loading="lazy"
    />
  );
}
