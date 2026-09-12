import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import { AudioRecorder } from "../components/AudioRecorder";
import type { Gender, SelfProfile, StiPreference, StiStatus } from "../types";

const ALL_GENDERS: { value: Gender; label: string }[] = [
  { value: "WOMAN", label: "Women" },
  { value: "MAN", label: "Men" },
  { value: "NONBINARY", label: "Non-binary people" },
  { value: "OTHER", label: "Other" },
];

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState<SelfProfile | null>(user);
  const [interestInput, setInterestInput] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(user);
  }, [user]);

  if (!form) return <div className="loading-center">Loading…</div>;

  function update<K extends keyof SelfProfile>(key: K, value: SelfProfile[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function addInterest() {
    const value = interestInput.trim().toLowerCase();
    if (!value || !form) return;
    if (form.interests.includes(value) || form.interests.length >= 20) {
      setInterestInput("");
      return;
    }
    update("interests", [...form.interests, value]);
    setInterestInput("");
  }

  function removeInterest(tag: string) {
    if (!form) return;
    update(
      "interests",
      form.interests.filter((i) => i !== tag)
    );
  }

  function toggleGender(g: Gender) {
    if (!form) return;
    const has = form.preferredGenders.includes(g);
    update(
      "preferredGenders",
      has ? form.preferredGenders.filter((x) => x !== g) : [...form.preferredGenders, g]
    );
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location detection.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update("locationLat", pos.coords.latitude);
        update("locationLng", pos.coords.longitude);
        setMessage("Location captured. Don't forget to save.");
      },
      () => setError("Couldn't get your location. You can skip this — it's optional.")
    );
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setMessage(null);
    setSavingProfile(true);
    try {
      const { user: updated } = await api.put<{ user: SelfProfile }>("/profile/me", {
        name: form.name,
        locationLat: form.locationLat,
        locationLng: form.locationLng,
        locationCity: form.locationCity,
        interests: form.interests,
        preferredGenders: form.preferredGenders,
        minAgePreference: form.minAgePreference,
        maxAgePreference: form.maxAgePreference,
        maxDistanceKm: form.maxDistanceKm,
        stiStatus: form.stiStatus,
        stiDetails: form.stiDetails,
        stiDisclosureVisible: form.stiDisclosureVisible,
        stiPreference: form.stiPreference,
      });
      setUser(updated);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveBio() {
    if (!recordedBlob) return;
    setError(null);
    setMessage(null);
    setSavingBio(true);
    try {
      const formData = new FormData();
      formData.append("audio", recordedBlob, "bio.webm");
      const { user: updated } = await api.post<{ user: SelfProfile }>(
        "/profile/me/audio-bio",
        formData
      );
      setUser(updated);
      setRecordedBlob(null);
      setMessage("Your audio bio is saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload your recording.");
    } finally {
      setSavingBio(false);
    }
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("photos", f));
      const { user: updated } = await api.post<{ user: SelfProfile }>(
        "/profile/me/photos",
        formData
      );
      setUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload photos.");
    } finally {
      setUploadingPhotos(false);
      e.target.value = "";
    }
  }

  async function handleRemovePhoto(index: number) {
    setError(null);
    try {
      const { user: updated } = await api.delete<{ user: SelfProfile }>(
        `/profile/me/photos/${index}`
      );
      setUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that photo.");
    }
  }

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Your voice, first</h2>
        <p className="subtitle">
          This is what matches hear before they see any photo. Keep it real — who you are, what
          you're looking for, what makes you, you.
        </p>
        <AudioRecorder onRecorded={setRecordedBlob} existingAudioUrl={user?.bioAudioUrl} />
        {recordedBlob && (
          <button className="btn btn-primary btn-block" onClick={handleSaveBio} disabled={savingBio}>
            {savingBio ? "Saving…" : "Save this recording"}
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Photos</h2>
        <p className="subtitle">Optional and secondary — up to 6, shown after your bio.</p>
        <div className="photo-grid">
          {form.photos.map((url, i) => (
            <div className="photo-thumb" key={url}>
              <img src={url} alt="" />
              <button className="photo-remove" onClick={() => handleRemovePhoto(i)} aria-label="Remove photo">
                ×
              </button>
            </div>
          ))}
          {form.photos.length < 6 && (
            <label className="photo-upload-tile">
              {uploadingPhotos ? "…" : "+"}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handlePhotoUpload}
                disabled={uploadingPhotos}
              />
            </label>
          )}
        </div>
      </div>

      <form onSubmit={handleSaveProfile}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Basics</h2>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input
              id="city"
              placeholder="e.g. Austin, TX"
              value={form.locationCity ?? ""}
              onChange={(e) => update("locationCity", e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={useCurrentLocation}>
            Use my current location
          </button>
          <div className="field-hint">
            {form.locationLat != null
              ? `Location set (${form.locationLat.toFixed(2)}, ${form.locationLng!.toFixed(2)})`
              : "No precise location set — you'll still match by city/interests, just not distance."}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Interests</h2>
          <p className="subtitle">Shared interests move you up in each other's discovery feed.</p>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {form.interests.map((tag) => (
              <span key={tag} className="chip selected" onClick={() => removeInterest(tag)}>
                {tag} ×
              </span>
            ))}
          </div>
          <div className="row">
            <input
              placeholder="Add an interest and press Enter"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addInterest();
                }
              }}
            />
            <button type="button" className="btn btn-secondary" onClick={addInterest}>
              Add
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Who you want to meet</h2>
          <div className="field">
            <label>Show me</label>
            <div className="chip-row">
              {ALL_GENDERS.map((g) => (
                <span
                  key={g.value}
                  className={`chip${form.preferredGenders.includes(g.value) ? " selected" : ""}`}
                  onClick={() => toggleGender(g.value)}
                >
                  {g.label}
                </span>
              ))}
            </div>
            <div className="field-hint">Leave all unselected to be open to everyone.</div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="minAge">Min age</label>
              <input
                id="minAge"
                type="number"
                min={18}
                max={99}
                value={form.minAgePreference}
                onChange={(e) => update("minAgePreference", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="maxAge">Max age</label>
              <input
                id="maxAge"
                type="number"
                min={18}
                max={99}
                value={form.maxAgePreference}
                onChange={(e) => update("maxAgePreference", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="distance">Max distance (km)</label>
            <input
              id="distance"
              type="number"
              min={1}
              value={form.maxDistanceKm}
              onChange={(e) => update("maxDistanceKm", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2>STI status</h2>
          <div className="info-box">
            Sharing this here is optional and just between you and your matches — the goal is to
            make the conversation normal, not scary. An honest "undisclosed" is always okay.
          </div>
          <div className="field">
            <label htmlFor="stiStatus">Your status</label>
            <select
              id="stiStatus"
              value={form.stiStatus}
              onChange={(e) => update("stiStatus", e.target.value as StiStatus)}
            >
              <option value="UNDISCLOSED">Prefer not to say</option>
              <option value="NEGATIVE">Negative / no known STIs</option>
              <option value="POSITIVE">Positive — I'll share details</option>
            </select>
          </div>
          {form.stiStatus === "POSITIVE" && (
            <div className="field">
              <label htmlFor="stiDetails">Details (shown to matches, in your own words)</label>
              <textarea
                id="stiDetails"
                rows={3}
                placeholder="e.g. HSV-2, managed with medication. Happy to answer questions."
                value={form.stiDetails ?? ""}
                onChange={(e) => update("stiDetails", e.target.value)}
              />
            </div>
          )}
          <div className="checkbox-row" style={{ marginBottom: 16 }}>
            <input
              id="stiVisible"
              type="checkbox"
              checked={form.stiDisclosureVisible}
              onChange={(e) => update("stiDisclosureVisible", e.target.checked)}
            />
            <label htmlFor="stiVisible" style={{ margin: 0 }}>
              Show my status on my profile
            </label>
          </div>
          <div className="field">
            <label htmlFor="stiPref">Who you're shown</label>
            <select
              id="stiPref"
              value={form.stiPreference}
              onChange={(e) => update("stiPreference", e.target.value as StiPreference)}
            >
              <option value="NO_PREFERENCE">No preference</option>
              <option value="PREFER_NEGATIVE_ONLY">Only show me people who disclosed negative</option>
            </select>
            <div className="field-hint">
              This never hides people who chose not to disclose — only an explicit positive
              disclosure, if you've opted into a negative-only feed.
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-block" disabled={savingProfile}>
          {savingProfile ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
