# ONNX model weights

After training:

```bash
pip install -r training/requirements.txt
python training/download_data.py --max-files 200
python training/train_melody.py --epochs 8
```

Produces `melody-v1.onnx` here. The extension loads it automatically from this path (dev) or extension storage (packaged).

The file is gitignored by default due to size; commit a release build separately if desired.
