# Music Generation Using LSTM

Conv1D + LSTM model trained on Bach chorales, with a simple web UI to generate new sequences and export MIDI.

## What's inside
- `Music_Generation_Using_LSTM.ipynb` — training and experimentation notebook
- `bach_generation_conv1d_lstm.keras` — trained model file
- `Dataset/` — chorale CSVs used for training/validation
- `ui/` — lightweight HTML/CSS/JS UI + Python inference server

## Quick start (UI)
```bash
cd "ui"
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

### Install dependencies
Apple Silicon (M1/M2/M3):
```bash
python -m pip install numpy music21 tensorflow-macos tensorflow-metal
```

Intel Mac:
```bash
python -m pip install numpy music21 tensorflow
```

### Run the server
```bash
python server.py
```
Open http://localhost:8000
live https://music-generation-using-lstm-43wx.onrender.com

## UI features
- Manual seed chords (8x4)
- Random seed generator
- CSV seed upload
- Piano‑roll visualization
- MIDI download
- In‑browser audio playback

## Model notes
- MIDI range is `36–81`, with `0` as rest
- Generates note‑by‑note, then reshaped into 4‑note chords

## Training
Open the notebook and run the cells in order:
```bash
jupyter notebook Music_Generation_Using_LSTM.ipynb
```
