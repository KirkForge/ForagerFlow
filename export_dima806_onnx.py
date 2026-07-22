import sys
import json
import hashlib
from pathlib import Path
import onnx
import torch
from transformers import AutoModelForImageClassification

ROOT = Path(__file__).parent.resolve()
SNAPSHOT_DIR = ROOT / "models--dima806--mushrooms_image_detection/snapshots/d31a228b021d9d2016813aac5ab84b1748dba53b"

# Download from HF Hub if not cached locally
if not SNAPSHOT_DIR.exists():
    print("Downloading dima806 model from Hugging Face Hub...")
    model = AutoModelForImageClassification.from_pretrained(
        "dima806/mushrooms_image_detection",
        torch_dtype=torch.float32,
    )
else:
    print("Loading dima806 from local cache...")
    model = AutoModelForImageClassification.from_pretrained(
        str(SNAPSHOT_DIR),
        local_files_only=True,
    )

model.eval()

# Export to a buffer first, then re-save monolithically — see the matching
# comment in export_bvra_onnx.py for why.
buf_path = ROOT / "pwa/model/dima806.tmp.onnx"
torch.onnx.export(
    model,
    torch.randn(1, 3, 224, 224),
    buf_path,
    export_params=True,
    opset_version=14,
    do_constant_folding=True,
    input_names=["pixel_values"],
    output_names=["logits"],
    dynamic_axes={
        "pixel_values": {0: "batch_size"},
        "logits": {0: "batch_size"},
    },
)

loaded = onnx.load(str(buf_path), load_external_data=True)
buf_path.unlink()
sidecar = ROOT / "pwa/model/dima806.tmp.onnx.data"
if sidecar.exists():
    sidecar.unlink()

final_path = ROOT / "pwa/model/dima806.onnx"
onnx.save(loaded, str(final_path), save_as_external_data=False)
print(f"ONNX export complete (monolithic): {final_path}  ({final_path.stat().st_size} bytes)")

# Write provenance JSON
onnx_checksum = hashlib.sha256(final_path.read_bytes()).hexdigest()
labels_path = ROOT / "src/data/labels-dima806.json"
label_map_version = (
    hashlib.sha256(labels_path.read_bytes()).hexdigest()[:12]
    if labels_path.exists()
    else "unknown"
)
model_source_hash = "hf:dima806/mushrooms_image_detection"
provenance = {
    "modelSourceHash": model_source_hash,
    "onnxChecksum": f"sha256:{onnx_checksum}",
    "labelMapVersion": label_map_version,
}
provenance_path = ROOT / "pwa/model/dima806.provenance.json"
with open(provenance_path, "w") as f:
    json.dump(provenance, f, indent=2)
print(f"Provenance written: {provenance_path}")
