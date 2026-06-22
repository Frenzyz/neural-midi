# Training (offline)

Neural Midi trains models outside Ableton Live, then exports ONNX for on-device inference.

## Planned pipeline

1. Curate royalty-free MIDI datasets per genre
2. Tokenize to pitch / duration / velocity sequences with key-scale conditioning
3. Train a small transformer or LSTM in PyTorch
4. Export to ONNX with INT8 quantization
5. Copy `melody-v1.onnx` to `models/` and rebuild the extension

Training code will live in this directory in a future phase.
