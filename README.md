# Lowered Expectations

A dating app built around hearing someone before you see them. Instead of
swiping through photos, you record a short audio "about me," and the people
you match with hear it before deciding whether to say hello.

## How it works

1. **Record your bio.** Every profile centers on a recorded about-me clip
   instead of a wall of photos. Photos are supported too, but they're
   secondary — shown after the bio, not instead of it.
2. **Discover people.** The app finds candidates based on location,
   shared interests, age range, gender/orientation preferences, and (if you
   opt in) STI-disclosure preferences.
3. **Listen, then decide.** You hear the other person's bio, then choose to
   **pass**, send one of a few **predetermined greetings**, or **write your
   own message**. They go through the exact same decision about you,
   independently.
4. **Match and talk.** Once you've both sent something other than a pass,
   it's a match and a chat thread opens up.
5. **STI disclosure, without the stigma.** Status is optional, shown with
   supportive framing, and never silently filters anyone out — it only
   affects your feed if you explicitly opt into a "negative only" preference,
   and even then it never hides someone who chose not to disclose.

## Project layout

```
backend/    Express + TypeScript API, Prisma/SQLite, audio & photo uploads
frontend/   React + TypeScript (Vite) client
```

## Running it locally

Requires Node.js 20+.

### 1. Backend

```bash
cd backend
npm install
npx prisma migrate deploy   # creates dev.db from the committed migrations
npm run seed                # optional: adds a few demo profiles to match against
npm run dev                 # http://localhost:4000
```

Demo accounts from the seed script (password for all: `password123`):
`amara@example.com`, `diego@example.com`, `jules@example.com`, `priya@example.com`.

Environment variables live in `backend/.env` (see `.env.example`) —
`DATABASE_URL`, `JWT_SECRET`, `PORT`. Uploaded audio/photos are stored on
disk under `backend/uploads/` and served at `/uploads/*`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:4000`,
so run the backend first.

Recording an audio bio needs microphone access (`MediaRecorder` /
`getUserMedia`), which most browsers only allow on `localhost` or HTTPS.

## API overview

All routes except `/api/auth/register` and `/api/auth/login` require
`Authorization: Bearer <token>`.

| Route | Purpose |
|---|---|
| `POST /api/auth/register`, `/login`, `GET /me` | Account creation & session |
| `GET/PUT /api/profile/me` | Read/update your profile & preferences |
| `POST /api/profile/me/audio-bio` | Upload your recorded about-me clip |
| `POST /api/profile/me/photos`, `DELETE /api/profile/me/photos/:index` | Manage additional photos |
| `GET /api/discovery/next` | Next person to hear the bio of (prioritizes anyone who already messaged you) |
| `GET /api/discovery/greetings` | The list of predetermined hello messages |
| `POST /api/discovery/interact` | Record a pass / greeting / message decision; returns whether it created a match |
| `GET /api/matches` | Your mutual matches |
| `GET/POST /api/matches/:matchId/messages` | Chat within a match |

## Design notes

- **Matching is mutual.** A candidate only appears if *both* people's stated
  gender/orientation, age range, and distance preferences are satisfied —
  not just yours.
- **Reciprocity is explicit.** If someone already sent you a greeting or
  message you haven't responded to, they're surfaced next in your discovery
  feed ahead of new candidates — that's what makes the "same scenario is
  presented to user2" flow actually happen, rather than leaving it to chance.
- **SQLite via Prisma** keeps local setup to zero config. The schema is
  written to swap to Postgres/MySQL by changing one `datasource` block.
