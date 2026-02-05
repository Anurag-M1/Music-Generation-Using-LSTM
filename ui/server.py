import json
import os
import tempfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import numpy as np
from tensorflow import keras
from music21 import stream, chord

MIN_NOTE = 36
MAX_NOTE = 81

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH = os.path.join(BASE_DIR, "bach_generation_conv1d_lstm.keras")

MODEL = keras.models.load_model(MODEL_PATH)


def map_to_tokens(notes):
    data = np.array(notes, dtype=int)
    data = np.where(data == 0, 0, data - MIN_NOTE + 1)
    data = np.clip(data, 0, MAX_NOTE - MIN_NOTE + 1)
    return data


def map_to_midi(tokens):
    data = np.array(tokens, dtype=int)
    data = np.where(data == 0, 0, data + MIN_NOTE - 1)
    return data


def sample_next_note(probs, rng):
    probabilities = np.asarray(probs, dtype=float)
    probs_sum = probabilities.sum()
    if probs_sum <= 0 or not np.isfinite(probs_sum):
        return int(np.argmax(probabilities))
    probabilities /= probs_sum
    return int(rng.choice(len(probabilities), p=probabilities))


def generate_chorale(model, seed_chords, length, rng_seed=None):
    rng = np.random.default_rng(rng_seed)
    token_sequence = map_to_tokens(seed_chords).reshape(1, -1)

    for _ in range(int(length) * 4):
        next_token_probabilities = model.predict(token_sequence, verbose=0)[0, -1]
        next_token = sample_next_note(next_token_probabilities, rng)
        token_sequence = np.concatenate([token_sequence, [[next_token]]], axis=1)

    token_sequence = map_to_midi(token_sequence)
    return token_sequence.reshape(-1, 4).tolist()


def generate_random_seed(length=8, rest_probability=0.2, pitch_low=36, pitch_high=81, seed=None):
    rng = np.random.default_rng(seed)
    random_pitches = rng.integers(pitch_low, pitch_high + 1, size=(length, 4))
    rest_mask = rng.random((length, 4)) < float(rest_probability)
    chorale = np.where(rest_mask, 0, random_pitches).astype(int)
    return chorale.tolist()


def normalize_seed(seed):
    normalized = []
    for row in seed[:8]:
        chord = []
        for value in row[:4]:
            try:
                chord.append(int(value))
            except (TypeError, ValueError):
                chord.append(0)
        while len(chord) < 4:
            chord.append(0)
        normalized.append(chord)
    while len(normalized) < 8:
        normalized.append([0, 0, 0, 0])
    return normalized


def chorale_to_midi_bytes(chorale):
    s = stream.Stream()
    for row in chorale:
        s.append(chord.Chord([int(n) for n in row if int(n) != 0], quarterLength=1))
    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as tmp:
        path = tmp.name
    try:
        s.write("midi", fp=path)
        with open(path, "rb") as f:
            data = f.read()
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return data


class Handler(SimpleHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/status":
            self._send_json({"model_loaded": MODEL is not None})
            return
        if self.path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, status=400)
            return

        if self.path == "/api/generate":
            seed_type = payload.get("seed_type", "manual")
            gen_length = payload.get("length", 56)
            random_seed = payload.get("random_seed")
            seed_random = payload.get("seed_random", random_seed)
            rest_probability = payload.get("rest_probability", 0.2)

            if seed_type == "random":
                seed_chords = generate_random_seed(
                    length=8,
                    rest_probability=rest_probability,
                    seed=seed_random,
                )
            else:
                seed_chords = normalize_seed(payload.get("seed_chords") or [])

            chorale = generate_chorale(MODEL, seed_chords, gen_length, rng_seed=random_seed)
            self._send_json({
                "seed_chords": seed_chords,
                "chorale": chorale,
                "generated_start": len(seed_chords),
            })
            return

        if self.path == "/api/midi":
            chorale = payload.get("chorale")
            if not chorale:
                self._send_json({"error": "No chorale provided"}, status=400)
                return
            data = chorale_to_midi_bytes(chorale)
            self.send_response(200)
            self.send_header("Content-Type", "audio/midi")
            self.send_header("Content-Disposition", "attachment; filename=generated_chorale.mid")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        self._send_json({"error": "Unknown endpoint"}, status=404)


def main():
    os.chdir(os.path.dirname(__file__))
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("", port), Handler)
    print(f"Serving on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
