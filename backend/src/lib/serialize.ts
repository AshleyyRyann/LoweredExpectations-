import { User } from "@prisma/client";
import { ageFromDob, parseJsonArray } from "./utils";

// Full self-view: includes preference settings, used for "my profile".
export function serializeSelf(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    dateOfBirth: user.dateOfBirth.toISOString().slice(0, 10),
    age: ageFromDob(user.dateOfBirth),
    gender: user.gender,
    locationLat: user.locationLat,
    locationLng: user.locationLng,
    locationCity: user.locationCity,
    bioAudioUrl: user.bioAudioUrl,
    photos: parseJsonArray(user.photos),
    interests: parseJsonArray(user.interests),
    preferredGenders: parseJsonArray(user.preferredGenders),
    minAgePreference: user.minAgePreference,
    maxAgePreference: user.maxAgePreference,
    maxDistanceKm: user.maxDistanceKm,
    stiStatus: user.stiStatus,
    stiDetails: user.stiDetails,
    stiDisclosureVisible: user.stiDisclosureVisible,
    stiPreference: user.stiPreference,
  };
}

// Public-facing view shown to other users during discovery/matches — no
// email, no preference settings, and STI info only if the user opted to
// show it.
export function serializePublic(user: User) {
  return {
    id: user.id,
    name: user.name,
    age: ageFromDob(user.dateOfBirth),
    gender: user.gender,
    locationCity: user.locationCity,
    bioAudioUrl: user.bioAudioUrl,
    photos: parseJsonArray(user.photos),
    interests: parseJsonArray(user.interests),
    stiStatus: user.stiDisclosureVisible ? user.stiStatus : "UNDISCLOSED",
    stiDetails: user.stiDisclosureVisible ? user.stiDetails : null,
  };
}
