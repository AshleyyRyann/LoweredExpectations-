import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma";

// Demo seed data so the discovery feed isn't empty on a fresh install.
// Seeded users have no recorded audio bio (there's no real audio to seed
// with) — the discover screen shows a "hasn't recorded a bio yet"
// placeholder for these, and behaves normally once a real user records one.
const DEMO_USERS = [
  {
    email: "amara@example.com",
    name: "Amara",
    dateOfBirth: "1996-03-14",
    gender: "WOMAN" as const,
    preferredGenders: ["MAN", "NONBINARY"],
    locationCity: "Austin, TX",
    locationLat: 30.2672,
    locationLng: -97.7431,
    interests: ["hiking", "live music", "cooking"],
    stiStatus: "NEGATIVE" as const,
  },
  {
    email: "diego@example.com",
    name: "Diego",
    dateOfBirth: "1993-07-22",
    gender: "MAN" as const,
    preferredGenders: ["WOMAN"],
    locationCity: "Austin, TX",
    locationLat: 30.2849,
    locationLng: -97.7341,
    interests: ["hiking", "board games", "coffee"],
    stiStatus: "UNDISCLOSED" as const,
  },
  {
    email: "jules@example.com",
    name: "Jules",
    dateOfBirth: "1998-11-02",
    gender: "NONBINARY" as const,
    preferredGenders: [],
    locationCity: "Austin, TX",
    locationLat: 30.25,
    locationLng: -97.75,
    interests: ["cooking", "cycling", "reading"],
    stiStatus: "POSITIVE" as const,
    stiDetails: "HSV-2, managed with medication. Happy to answer questions.",
  },
  {
    email: "priya@example.com",
    name: "Priya",
    dateOfBirth: "1995-05-30",
    gender: "WOMAN" as const,
    preferredGenders: ["WOMAN", "NONBINARY"],
    locationCity: "Dallas, TX",
    locationLat: 32.7767,
    locationLng: -96.797,
    interests: ["live music", "travel", "yoga"],
    stiStatus: "NEGATIVE" as const,
  },
];

async function main() {
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash("password123", 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        name: u.name,
        dateOfBirth: new Date(u.dateOfBirth),
        gender: u.gender,
        locationCity: u.locationCity,
        locationLat: u.locationLat,
        locationLng: u.locationLng,
        interests: JSON.stringify(u.interests),
        preferredGenders: JSON.stringify(u.preferredGenders),
        stiStatus: u.stiStatus,
        stiDetails: "stiDetails" in u ? u.stiDetails : null,
      },
    });
  }
  console.log(`Seeded ${DEMO_USERS.length} demo users (password: "password123").`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
