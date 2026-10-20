// Order and groups of the places on the reach pages: hotels, cafes, marts. The same place is named differently per platform
// ("Sontra mini Mart 24h", "SontraminiMart24h", "SƠN TRÀ SEA HOTEL"), so a name is matched on its letters and digits only. No imports: tested with plain Node.
const GROUPS = ["Khách sạn", "Cafe", "Mart"] as const;
const fold = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

/** [group, place] of a name; group 3 = anything else (e.g. the company page), listed last. */
function place(name: string): [number, number] {
  const n = fold(name);
  if (n.includes("mini")) return [2, n.includes("sontra") ? 0 : n.includes("quynhon") ? 1 : n.includes("gialai") ? 2 : 3];
  if (n.includes("taste") || n.includes("vintage") || n.includes("vinatage")) return [1, n.includes("hoian") ? 1 : n.includes("rooftop") ? 2 : 0];
  if (n.includes("yzistel")) return [0, 0];
  if (n.includes("hotel")) return [0, n.includes("quynhon") ? 1 : n.includes("gialai") ? 2 : n.includes("sontra") ? 3 : 4];
  return [3, 0];
}

export const reachGroup = (name: string) => GROUPS[place(name)[0]] ?? "Khác";

export function compareReach(a: string, b: string) {
  const [ga, ra] = place(a), [gb, rb] = place(b);
  return ga - gb || ra - rb || a.localeCompare(b);
}
