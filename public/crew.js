// Shared, side-effect-free queries for the server-relayed crew protocol.
// Participant IDs are public identifiers, never session credentials.
const Crew = (() => {
  const rolesForParticipant = (state, id) => id && state?.crew
    ? state.crew.stationOwners.flatMap((owner, role) => owner === id ? [role] : [])
    : [];
  const voteEligibleIds = state => state?.crew
    ? [...new Set(state.crew.stationOwners.filter(Boolean))]
    : [];
  const isOnline = (state, id) => !!id && !!state?.crew?.participants.some(p => p.id === id && p.online);
  const allAssignedOnline = state => !!state?.crew && state.crew.stationOwners.length === 3
    && state.crew.stationOwners.every(id => isOnline(state, id));
  const canCheck = (state, id) => rolesForParticipant(state, id).includes(0) && allAssignedOnline(state);
  // A block starts with the existing assignment. Persist the chosen direction
  // with the owners: reconnects/restarts never need to draw randomness.
  const nextRotation = (owners, previous, random = Math.random) => {
    const ids = [...new Set(owners)];
    if (ids.length === 1) return { owners: owners.slice(), rotation: null };
    const valid = previous && previous.owners.every((id, r) => id === owners[r]);
    const step = valid ? previous.step : 0;
    const pick = () => random() < 0.5 ? 1 : 2;
    let direction = valid ? previous.direction : pick();
    let next, nextStep;
    if (ids.length === 3) {
      // Inside each three-level block, finish the same cyclic permutation.
      // At the boundary either derangement is safe, then choose a new cycle.
      const shift = step === 2 ? pick() : direction;
      next = owners.map((_, r) => owners[(r + shift) % 3]);
      nextStep = (step + 1) % 3;
      if (nextStep === 0) direction = pick();
    } else {
      // Alternate the double workload; rotate the single station. Over six
      // levels each person operates every station exactly three times.
      const single = owners.findIndex(id => owners.filter(x => x === id).length === 1);
      const nextSingle = (single + direction) % 3;
      const doubleOwner = owners.find(id => id !== owners[single]);
      next = owners.map((_, r) => r === nextSingle ? doubleOwner : owners[single]);
      nextStep = (step + 1) % 6;
      if (nextStep === 0) direction = pick();
    }
    return { owners: next, rotation: { owners: next.slice(), step: nextStep, direction } };
  };
  return { nextRotation, rolesForParticipant, voteEligibleIds, isOnline, allAssignedOnline, canCheck };
})();

