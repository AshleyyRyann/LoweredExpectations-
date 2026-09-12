import { User } from "@prisma/client";
import { prisma } from "./prisma";
import { distanceKm } from "./geo";
import { ageFromDob, parseJsonArray } from "./utils";

// If someone has already sent `user` a greeting or message that `user`
// hasn't responded to yet, surface that person next rather than a fresh
// discovery pick. This is what makes the flow reciprocal: when user1 says
// hello, user2's very next candidate is user1, hearing the same bio-first
// decision — not a random stranger while user1's greeting waits indefinitely
// in a queue user2 may never scroll back to.
export async function findPendingInboundCandidate(user: User): Promise<User | null> {
  const received = await prisma.interaction.findMany({
    where: { toUserId: user.id, action: { not: "PASS" } },
    orderBy: { createdAt: "asc" },
  });
  if (received.length === 0) return null;

  const alreadyResponded = await prisma.interaction.findMany({
    where: { fromUserId: user.id, toUserId: { in: received.map((r) => r.fromUserId) } },
    select: { toUserId: true },
  });
  const respondedIds = new Set(alreadyResponded.map((r) => r.toUserId));

  const pending = received.find((r) => !respondedIds.has(r.fromUserId));
  if (!pending) return null;

  return prisma.user.findUnique({ where: { id: pending.fromUserId } });
}

// Finds the next best candidate for `user` to hear the audio bio of,
// ranked by shared interests then proximity. Compatibility is mutual:
// a candidate only appears if both people's stated preferences
// (gender, age range, distance, STI preference) are satisfied.
export async function findNextCandidate(user: User): Promise<User | null> {
  const alreadyInteracted = await prisma.interaction.findMany({
    where: { fromUserId: user.id },
    select: { toUserId: true },
  });
  const excludedIds = new Set(alreadyInteracted.map((i) => i.toUserId));
  excludedIds.add(user.id);

  const pool = await prisma.user.findMany({
    where: { id: { notIn: Array.from(excludedIds) } },
  });

  const userInterests = new Set(parseJsonArray(user.interests));
  const userPreferredGenders = parseJsonArray(user.preferredGenders);
  const userAge = ageFromDob(user.dateOfBirth);

  type Scored = { candidate: User; sharedInterests: number; distance: number | null };
  const scored: Scored[] = [];

  for (const candidate of pool) {
    if (!isMutuallyCompatible(user, candidate, userPreferredGenders, userAge)) continue;

    const candidateInterests = parseJsonArray(candidate.interests);
    const sharedInterests = candidateInterests.filter((i) => userInterests.has(i)).length;

    let distance: number | null = null;
    if (
      user.locationLat != null &&
      user.locationLng != null &&
      candidate.locationLat != null &&
      candidate.locationLng != null
    ) {
      distance = distanceKm(
        { lat: user.locationLat, lng: user.locationLng },
        { lat: candidate.locationLat, lng: candidate.locationLng }
      );
    }

    scored.push({ candidate, sharedInterests, distance });
  }

  scored.sort((a, b) => {
    if (b.sharedInterests !== a.sharedInterests) return b.sharedInterests - a.sharedInterests;
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });

  return scored[0]?.candidate ?? null;
}

function isMutuallyCompatible(
  user: User,
  candidate: User,
  userPreferredGenders: string[],
  userAge: number
): boolean {
  const candidatePreferredGenders = parseJsonArray(candidate.preferredGenders);
  const candidateAge = ageFromDob(candidate.dateOfBirth);

  // Gender / orientation: each person's stated preference list must include
  // the other's gender. An empty preference list is treated as "open to
  // anyone" rather than "no one".
  if (userPreferredGenders.length > 0 && !userPreferredGenders.includes(candidate.gender)) {
    return false;
  }
  if (
    candidatePreferredGenders.length > 0 &&
    !candidatePreferredGenders.includes(user.gender)
  ) {
    return false;
  }

  // Age range, checked both directions.
  if (candidateAge < user.minAgePreference || candidateAge > user.maxAgePreference) return false;
  if (userAge < candidate.minAgePreference || userAge > candidate.maxAgePreference) return false;

  // Distance, checked against whichever radius is stricter. Missing
  // location on either side is treated as "unknown" and not filtered out.
  if (
    user.locationLat != null &&
    user.locationLng != null &&
    candidate.locationLat != null &&
    candidate.locationLng != null
  ) {
    const d = distanceKm(
      { lat: user.locationLat, lng: user.locationLng },
      { lat: candidate.locationLat, lng: candidate.locationLng }
    );
    if (d > user.maxDistanceKm || d > candidate.maxDistanceKm) return false;
  }

  // STI preference is opt-in only: it never excludes anyone unless a user
  // has explicitly chosen PREFER_NEGATIVE_ONLY, and even then it only
  // screens out an explicit POSITIVE disclosure — never UNDISCLOSED.
  if (user.stiPreference === "PREFER_NEGATIVE_ONLY" && candidate.stiStatus === "POSITIVE") {
    return false;
  }
  if (candidate.stiPreference === "PREFER_NEGATIVE_ONLY" && user.stiStatus === "POSITIVE") {
    return false;
  }

  return true;
}
