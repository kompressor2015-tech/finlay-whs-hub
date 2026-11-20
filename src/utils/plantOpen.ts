/** Hands a unit number from another page to Plant safety, so it opens that unit's panel instead of just the list. */
let pending: string | null = null;

export function setPlantUnit(unitNo: string): void {
  pending = unitNo;
}

export function takePlantUnit(): string | null {
  const u = pending;
  pending = null;
  return u;
}
