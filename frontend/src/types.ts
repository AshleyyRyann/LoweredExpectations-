export type Gender = "WOMAN" | "MAN" | "NONBINARY" | "OTHER";
export type StiStatus = "UNDISCLOSED" | "NEGATIVE" | "POSITIVE";
export type StiPreference = "NO_PREFERENCE" | "PREFER_NEGATIVE_ONLY";
export type InteractionAction = "PASS" | "GREETING" | "MESSAGE";

export interface SelfProfile {
  id: string;
  email: string;
  name: string;
  dateOfBirth: string;
  age: number;
  gender: Gender;
  locationLat: number | null;
  locationLng: number | null;
  locationCity: string | null;
  bioAudioUrl: string | null;
  photos: string[];
  interests: string[];
  preferredGenders: Gender[];
  minAgePreference: number;
  maxAgePreference: number;
  maxDistanceKm: number;
  stiStatus: StiStatus;
  stiDetails: string | null;
  stiDisclosureVisible: boolean;
  stiPreference: StiPreference;
}

export interface PublicProfile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  locationCity: string | null;
  bioAudioUrl: string | null;
  photos: string[];
  interests: string[];
  stiStatus: StiStatus;
  stiDetails: string | null;
}

export interface MatchSummary {
  matchId: string;
  createdAt: string;
  user: PublicProfile;
}

export interface ChatMessageDto {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  mine: boolean;
}
