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
  return { rolesForParticipant, voteEligibleIds, isOnline, allAssignedOnline, canCheck };
})();

