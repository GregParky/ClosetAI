export function generateOutfit(closet, preferences, weather) {
  const { temperature } = weather;
  const { avoidDenimOnDenim, preferCasual } = preferences;

  const tops = closet.filter(item => item.type === 'top');
  const bottoms = closet.filter(item => item.type === 'bottom');
  const layers = closet.filter(item => item.type === 'layer');
  const shoes = closet.filter(item => item.type === 'shoes');

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  let top, bottom, shoe, layer;

  // Optionally prefer casual items
  const filterCasual = item => preferCasual ? item.style === 'casual' : true;

  top = pickRandom(tops.filter(filterCasual));
  bottom = pickRandom(bottoms.filter(filterCasual));
  shoe = pickRandom(shoes.filter(filterCasual));
  layer = temperature < 60 ? pickRandom(layers.filter(filterCasual)) : null;

  // Avoid denim-on-denim rule
  const isDenimConflict = avoidDenimOnDenim &&
    top?.name?.toLowerCase().includes('denim') &&
    bottom?.name?.toLowerCase().includes('denim');

  if (isDenimConflict) {
    return generateOutfit(closet, preferences, weather); // re-roll
  }

  return { top, bottom, layer, shoes: shoe };
}
