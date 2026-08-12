"""
Precomputes waveform peak data for every track in assets/audio/, so the
site can draw waveform bars on page load without downloading full mp3s.

Run this any time you add or replace a track:
    pip install numpy   (ffmpeg must also be installed and on PATH)
    python3 scripts/generate_waveforms.py

Safe to run anytime, including in a CI/build step before every deploy:
each track's source mp3 is hashed, and the hash is stored in
manifest.json alongside the generated peaks. On the next run, any
track whose mp3 hash hasn't changed is skipped entirely -- only new or
modified tracks get re-decoded.

Pass --force to ignore the manifest and regenerate everything.
"""
import subprocess, json, os, sys, hashlib

SEGMENTS = 64
SCRIPT_DIR = os.path.dirname(__file__)
AUDIO_DIR = os.path.join(SCRIPT_DIR, "..", "assets", "audio")
OUT_DIR = os.path.join(SCRIPT_DIR, "..", "assets", "waveforms")
MANIFEST_PATH = os.path.join(OUT_DIR, "manifest.json")
FORCE = "--force" in sys.argv


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH) as f:
            return json.load(f)
    return {}


def save_manifest(manifest):
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)


def compute_peaks(path):
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-"],
        capture_output=True
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode())

    import numpy as np
    samples = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    block_size = len(samples) // SEGMENTS
    amps = []
    for i in range(SEGMENTS):
        block = np.abs(samples[i * block_size:(i + 1) * block_size])
        amps.append(float(block.mean()) if len(block) else 0.0)
    max_val = max(amps) or 1.0
    return [round(a / max_val, 4) for a in amps]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {} if FORCE else load_manifest()

    tracks = sorted(f for f in os.listdir(AUDIO_DIR) if f.endswith(".mp3"))
    skipped, generated = 0, 0

    for fname in tracks:
        src_path = os.path.join(AUDIO_DIR, fname)
        out_name = os.path.splitext(fname)[0] + ".json"
        out_path = os.path.join(OUT_DIR, out_name)
        current_hash = file_hash(src_path)

        unchanged = (
            manifest.get(fname) == current_hash
            and os.path.exists(out_path)
        )
        if unchanged:
            print(f"skip    {fname} (unchanged)")
            skipped += 1
            continue

        try:
            peaks = compute_peaks(src_path)
        except RuntimeError as e:
            print(f"FAILED  {fname}: {e}")
            continue

        with open(out_path, "w") as f:
            json.dump(peaks, f, separators=(",", ":"))
        manifest[fname] = current_hash
        print(f"generate {fname} -> {out_name} ({os.path.getsize(out_path)} bytes)")
        generated += 1

    # Drop stale entries for tracks that no longer exist
    for fname in list(manifest.keys()):
        if fname not in tracks:
            del manifest[fname]

    save_manifest(manifest)
    print(f"\nDone: {generated} generated, {skipped} skipped (unchanged).")


if __name__ == "__main__":
    main()
